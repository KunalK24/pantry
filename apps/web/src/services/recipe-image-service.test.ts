import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/image-upload";

const { findRecipe, findJob, upsertImage, pinAddress, requestImage } = vi.hoisted(() => ({
  findRecipe: vi.fn(), findJob: vi.fn(), upsertImage: vi.fn(), pinAddress: vi.fn(), requestImage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  recipe: { findFirst: findRecipe }, aiJob: { findFirst: findJob }, recipeImage: { upsert: upsertImage },
} }));
vi.mock("@/services/recipe-service", () => ({ RecipeNotFoundError: class RecipeNotFoundError extends Error {} }));
vi.mock("@/services/recipe-url-acquisition-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/recipe-url-acquisition-service")>()), pinAddress,
}));
vi.mock("node:https", () => ({ default: { request: requestImage } }));
vi.mock("node:http", () => ({ default: { request: requestImage } }));

import { RecipeImageError, saveImportedRecipeImage, validateImage } from "./recipe-image-service";

const userId = "cm12345678901234567890123";
const recipeId = "cm22345678901234567890123";
const jobId = "cm32345678901234567890123";
const dishUrl = "https://example.com/dish.jpg";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const draft = { name: "Dish", instructions: "Cook it.", ingredients: [{ name: "Food", quantity: "1" }] };

type MockIncoming = EventEmitter & { headers: Record<string, string>; statusCode: number; destroy: () => void };
type MockRequest = EventEmitter & { end: () => void; destroy: (error: Error) => void };

function respond(status: number, headers: Record<string, string>, body = jpeg) {
  requestImage.mockImplementationOnce((_url: URL, _options: unknown, callback: (incoming: MockIncoming) => void) => {
    const request = new EventEmitter() as MockRequest;
    request.destroy = (error) => request.emit("error", error);
    request.end = () => {
      queueMicrotask(() => {
        const incoming = new EventEmitter() as MockIncoming;
        incoming.headers = headers;
        incoming.statusCode = status;
        incoming.destroy = () => undefined;
        callback(incoming);
        queueMicrotask(() => {
          incoming.emit("data", body);
          incoming.emit("end");
          request.emit("close");
        });
      });
    };
    return request;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findRecipe.mockResolvedValue({ id: recipeId });
  findJob.mockResolvedValue({ resultJson: { draft, imageCandidate: { kind: "source_url", url: dishUrl } } });
  pinAddress.mockResolvedValue({ address: "93.184.215.14", family: 4 });
  upsertImage.mockResolvedValue({});
});

describe("recipe image validation", () => {
  it("accepts supported image signatures", () => {
    expect(validateImage(jpeg, "image/jpeg")).toBe("image/jpeg");
    expect(validateImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png")).toBe("image/png");
    expect(validateImage(Buffer.from("RIFF0000WEBP"), "image/webp")).toBe("image/webp");
  });

  it("rejects oversized and mislabeled data", () => {
    expect(() => validateImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), "image/jpeg")).toThrowError(RecipeImageError);
    expect(() => validateImage(Buffer.from("not an image"), "image/png")).toThrowError(RecipeImageError);
  });
});

describe("imported recipe image storage", () => {
  it("does not query import jobs for a recipe the user does not own", async () => {
    findRecipe.mockResolvedValue(null);
    await expect(saveImportedRecipeImage(userId, recipeId, jobId)).rejects.toThrow();
    expect(findJob).not.toHaveBeenCalled();
    expect(requestImage).not.toHaveBeenCalled();
  });

  it("requires an owned, successful, unexpired import job before fetching", async () => {
    findJob.mockResolvedValue(null);
    await expect(saveImportedRecipeImage(userId, recipeId, jobId)).rejects.toMatchObject({ code: "invalid_candidate" });
    expect(findRecipe).toHaveBeenCalledWith({ where: { id: recipeId, userId }, select: { id: true } });
    expect(findJob).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: jobId, userId, type: "RECIPE_IMPORT", status: "SUCCEEDED", expiresAt: { gt: expect.any(Date) } }),
      select: { resultJson: true },
    });
    expect(requestImage).not.toHaveBeenCalled();
    expect(upsertImage).not.toHaveBeenCalled();
  });

  it("rejects a job result without a source URL candidate", async () => {
    findJob.mockResolvedValue({ resultJson: { draft, imageCandidate: { kind: "source_upload" } } });
    await expect(saveImportedRecipeImage(userId, recipeId, jobId)).rejects.toMatchObject({ code: "invalid_candidate" });
    expect(requestImage).not.toHaveBeenCalled();
  });

  it("pins each redirect target and stores the verified bytes", async () => {
    respond(302, { location: "https://images.example.com/final.jpg" });
    respond(200, { "content-type": "image/jpeg", "content-length": String(jpeg.length) });
    await expect(saveImportedRecipeImage(userId, recipeId, jobId)).resolves.toBe(`/api/recipes/${recipeId}/image`);
    expect(pinAddress.mock.calls.map(([url]) => url.href)).toEqual([dishUrl, "https://images.example.com/final.jpg"]);
    expect(requestImage).toHaveBeenCalledTimes(2);
    const firstLookup = requestImage.mock.calls[0][1].lookup;
    const addresses = await new Promise((resolve) => {
      firstLookup("example.com", { all: true }, (_error: unknown, result: unknown) => resolve(result));
    });
    expect(addresses).toEqual([{ address: "93.184.215.14", family: 4 }]);
    expect(upsertImage).toHaveBeenCalledWith({
      where: { recipeId },
      create: { recipeId, data: Uint8Array.from(jpeg), mimeType: "image/jpeg" },
      update: { data: Uint8Array.from(jpeg), mimeType: "image/jpeg" },
    });
  });

  it("rejects a redirect to a private address before another request", async () => {
    respond(302, { location: "http://127.0.0.1/private.jpg" });
    await expect(saveImportedRecipeImage(userId, recipeId, jobId)).rejects.toMatchObject({ code: "source_unavailable" });
    expect(requestImage).toHaveBeenCalledOnce();
    expect(upsertImage).not.toHaveBeenCalled();
  });

  it("rejects oversized and mislabeled remote images without storing them", async () => {
    respond(200, { "content-type": "image/jpeg", "content-length": String(MAX_IMAGE_BYTES + 1) });
    await expect(saveImportedRecipeImage(userId, recipeId, jobId)).rejects.toMatchObject({ code: "too_large" });
    expect(upsertImage).not.toHaveBeenCalled();
    respond(200, { "content-type": "image/png", "content-length": String(jpeg.length) });
    await expect(saveImportedRecipeImage(userId, recipeId, jobId)).rejects.toMatchObject({ code: "invalid_image" });
    expect(upsertImage).not.toHaveBeenCalled();
  });
});
