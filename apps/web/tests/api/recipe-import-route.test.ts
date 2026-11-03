import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, run, rateLimit } = vi.hoisted(() => ({ auth: vi.fn(), run: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuth: auth }));
vi.mock("@/lib/import-rate-limit", () => ({ checkImportRateLimit: rateLimit }));
vi.mock("@/services/synchronous-import-service", () => ({
  importRecipeSynchronously: run,
  ImportDeadlineError: class ImportDeadlineError extends Error {},
}));

import { POST, maxDuration } from "@/app/api/recipe-imports/route";
import { ImportDeadlineError } from "@/services/synchronous-import-service";

const url = "http://localhost/api/recipe-imports";
const draft = {
  name: "Toast",
  instructions: "Toast bread.",
  ingredients: [{ name: "Bread", quantity: "2" }],
};
const request = (body: unknown) => new Request(url, { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "user-1" }, response: null });
  rateLimit.mockResolvedValue({ status: "allowed" });
});

describe("POST /api/recipe-imports", () => {
  it("returns the recipe draft directly without source input", async () => {
    run.mockResolvedValue({ draft, imageCandidate: null, importJobId: null });
    const response = await POST(request({ type: "text", text: "Secret recipe text" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draft, imageCandidate: null, importJobId: null });
    expect(run).toHaveBeenCalledWith({ type: "text", text: "Secret recipe text" }, "user-1");
    expect(rateLimit).toHaveBeenCalledWith("user-1");
    expect(maxDuration).toBe(120);
  });

  it("requires authentication", async () => {
    auth.mockResolvedValue({ user: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await POST(request({ type: "text", text: "Toast" }))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("rejects invalid request data", async () => {
    expect((await POST(request({ type: "url", url: "file:///private/recipe" }))).status).toBe(400);
    expect((await POST(new Request(url, { method: "POST", body: "{" }))).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("rejects oversized images before import", async () => {
    const response = await POST(request({
      type: "image",
      image: { mimeType: "image/png", data: Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64") },
    }));
    expect(response.status).toBe(413);
    expect(run).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("enforces the shared daily import limit with Retry-After", async () => {
    rateLimit.mockResolvedValue({ status: "limited", retryAfterSeconds: 3600 });
    const response = await POST(request({ type: "text", text: "Toast" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3600");
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed if the import limit store is unavailable", async () => {
    rateLimit.mockResolvedValue({ status: "unavailable" });
    expect((await POST(request({ type: "text", text: "Toast" }))).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns a timeout before the Vercel function limit", async () => {
    run.mockRejectedValue(new ImportDeadlineError());
    const response = await POST(request({ type: "text", text: "Toast" }));
    expect(response.status).toBe(504);
  });
});
