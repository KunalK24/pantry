import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuth, createAiJob, getAiJobForUser, cancelAiJobForUser } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createAiJob: vi.fn(),
  getAiJobForUser: vi.fn(),
  cancelAiJobForUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth }));
vi.mock("@/services/ai-job-service", () => ({
  createAiJob,
  getAiJobForUser,
  cancelAiJobForUser,
  AiJobEnqueueError: class AiJobEnqueueError extends Error {},
  ActiveImportLimitError: class ActiveImportLimitError extends Error {},
}));

import { POST } from "@/app/api/pantry-extractions/route";
import { GET } from "@/app/api/pantry-extractions/[id]/route";
import { POST as cancelRoute } from "@/app/api/pantry-extractions/[id]/cancel/route";

const endpoint = "http://localhost/api/pantry-extractions";
const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]).toString("base64");
const pngData = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString("base64");
const webpData = Buffer.from("RIFF1234WEBP", "ascii").toString("base64");
const image = {
  type: "image",
  image: { mimeType: "image/jpeg", data: jpegData },
};
const id = "cm12345678901234567890123";
const timestamp = new Date("2026-10-23T00:00:00.000Z");
const context = { params: Promise.resolve({ id }) };

function request(body: unknown) {
  return new Request(endpoint, { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ user: { id: "user-1" }, response: null });
});

describe("POST /api/pantry-extractions", () => {
  it("queues a valid image without returning its data", async () => {
    createAiJob.mockResolvedValue({ id, expiresAt: timestamp });
    const response = await POST(request(image));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      id,
      status: "queued",
      sourceType: "image",
      stage: "queued",
      expiresAt: timestamp.toISOString(),
    });
    expect(createAiJob).toHaveBeenCalledWith({
      jobType: "pantry_import",
      input: image,
      userId: "user-1",
    });
  });

  it("requires authentication", async () => {
    requireAuth.mockResolvedValue({
      user: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const response = await POST(request(image));
    expect(response.status).toBe(401);
    expect(createAiJob).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...image, type: "text" }, 400],
    [{ ...image, image: { ...image.image, data: "invalid!" } }, 400],
    [{ ...image, image: { ...image.image, data: "aGVsbG8=" } }, 400],
    [{ ...image, image: { ...image.image, data: pngData } }, 400],
    [{ ...image, image: { mimeType: "image/png", data: jpegData } }, 400],
    [{ ...image, image: { ...image.image, data: "A".repeat(7_000_000) } }, 413],
  ])("rejects invalid image requests", async (body, status) => {
    const response = await POST(request(body));
    expect(response.status).toBe(status);
    expect(createAiJob).not.toHaveBeenCalled();
  });

  it.each([
    ["image/png", pngData],
    ["image/webp", webpData],
  ])("accepts matching %s image bytes", async (mimeType, data) => {
    createAiJob.mockResolvedValue({ id, expiresAt: timestamp });
    const response = await POST(request({
      type: "image",
      image: { mimeType, data },
    }));
    expect(response.status).toBe(202);
    expect(createAiJob).toHaveBeenCalledOnce();
  });

  it("reports queue unavailability", async () => {
    const { AiJobEnqueueError } = await import("@/services/ai-job-service");
    createAiJob.mockRejectedValue(new AiJobEnqueueError());
    const response = await POST(request(image));
    expect(response.status).toBe(503);
  });

  it("limits active pantry imports", async () => {
    const { ActiveImportLimitError } = await import("@/services/ai-job-service");
    createAiJob.mockRejectedValue(new ActiveImportLimitError());
    const response = await POST(request(image));
    expect(response.status).toBe(429);
  });
});

describe("pantry import job routes", () => {
  it("returns a validated item draft for an owned completed job", async () => {
    getAiJobForUser.mockResolvedValue({
      id,
      status: "SUCCEEDED",
      sourceType: "image",
      progressMessage: "complete",
      resultJson: { items: [{ name: "Carrots", quantity: "1", unit: "bag" }] },
      errorCode: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: timestamp,
    });
    const response = await GET(new Request(`${endpoint}/${id}`), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id,
      status: "succeeded",
      sourceType: "image",
      stage: "complete",
      draft: { items: [{ name: "Carrots", quantity: "1", unit: "bag" }] },
      error: null,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
      expiresAt: timestamp.toISOString(),
    });
    expect(getAiJobForUser).toHaveBeenCalledWith(id, "user-1", "PANTRY_IMPORT");
  });

  it("returns 404 for unowned or wrong-type jobs", async () => {
    getAiJobForUser.mockResolvedValue(null);
    const response = await GET(new Request(`${endpoint}/${id}`), context);
    expect(response.status).toBe(404);
  });

  it("cancels only an owned pantry import", async () => {
    cancelAiJobForUser.mockResolvedValue({
      id,
      status: "CANCELED",
      sourceType: "image",
      progressMessage: "normalizing",
      resultJson: null,
      errorCode: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: timestamp,
    });
    const response = await cancelRoute(
      new Request(`${endpoint}/${id}/cancel`, { method: "POST" }),
      context,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "canceled" });
    expect(cancelAiJobForUser).toHaveBeenCalledWith(id, "user-1", "PANTRY_IMPORT");
  });
});
