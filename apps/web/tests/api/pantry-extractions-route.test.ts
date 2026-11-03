import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, run, rateLimit } = vi.hoisted(() => ({ auth: vi.fn(), run: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuth: auth }));
vi.mock("@/lib/import-rate-limit", () => ({ checkImportRateLimit: rateLimit }));
vi.mock("@/services/synchronous-import-service", () => ({
  extractPantrySynchronously: run,
  ImportDeadlineError: class ImportDeadlineError extends Error {},
}));

import { POST, maxDuration } from "@/app/api/pantry-extractions/route";
import { ImportDeadlineError } from "@/services/synchronous-import-service";

const endpoint = "http://localhost/api/pantry-extractions";
const image = { type: "image", image: { mimeType: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64") } };
const request = (body: unknown) => new Request(endpoint, { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "user-1" }, response: null });
  rateLimit.mockResolvedValue({ status: "allowed" });
});

describe("POST /api/pantry-extractions", () => {
  it("returns the editable draft directly without image data", async () => {
    const draft = { items: [{ name: "Carrots", quantity: "1", unit: "bag" }] };
    run.mockResolvedValue(draft);
    const response = await POST(request(image));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draft });
    expect(run).toHaveBeenCalledWith(image);
    expect(rateLimit).toHaveBeenCalledWith("user-1");
    expect(maxDuration).toBe(120);
  });

  it("requires authentication", async () => {
    auth.mockResolvedValue({ user: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await POST(request(image))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("rejects malformed and mismatched images", async () => {
    expect((await POST(request({ ...image, image: { ...image.image, data: "invalid!" } }))).status).toBe(400);
    expect((await POST(request({ ...image, image: { mimeType: "image/png", data: image.image.data } }))).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("enforces the shared daily import limit with Retry-After", async () => {
    rateLimit.mockResolvedValue({ status: "limited", retryAfterSeconds: 7200 });
    const response = await POST(request(image));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7200");
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed if the import limit store is unavailable", async () => {
    rateLimit.mockResolvedValue({ status: "unavailable" });
    expect((await POST(request(image))).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns a timeout before the Vercel function limit", async () => {
    run.mockRejectedValue(new ImportDeadlineError());
    expect((await POST(request(image))).status).toBe(504);
  });
});
