import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, getImage, saveImage, saveImportedImage, deleteImage } = vi.hoisted(() => ({
  auth: vi.fn(),
  getImage: vi.fn(),
  saveImage: vi.fn(),
  saveImportedImage: vi.fn(),
  deleteImage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: auth }));
vi.mock("@/services/recipe-service", () => ({
  RecipeNotFoundError: class RecipeNotFoundError extends Error {
    constructor(recipeId: string) { super(`Recipe ${recipeId} was not found`); }
  },
}));
vi.mock("@/services/recipe-image-service", () => ({
  getRecipeImage: getImage,
  saveRecipeImage: saveImage,
  saveImportedRecipeImage: saveImportedImage,
  deleteRecipeImage: deleteImage,
  RecipeImageError: class RecipeImageError extends Error {
    constructor(public code: string) { super(code); }
  },
}));

import { GET, POST, DELETE } from "@/app/api/recipes/[id]/image/route";
import { RecipeNotFoundError } from "@/services/recipe-service";

const recipeId = "cm12345678901234567890123";
const userId = "cm22345678901234567890123";
const endpoint = `http://localhost/api/recipes/${recipeId}/image`;
const context = { params: Promise.resolve({ id: recipeId }) };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: userId }, response: null });
});

describe("recipe image route", () => {
  it("requires authentication before reading the image", async () => {
    auth.mockResolvedValue({ user: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await GET(new Request(endpoint), context)).status).toBe(401);
    expect(getImage).not.toHaveBeenCalled();
  });

  it("serves an owned image with private cache headers and reports absent images", async () => {
    getImage.mockResolvedValueOnce({ mimeType: "image/jpeg", data: Uint8Array.from([0xff, 0xd8, 0xff]) });
    const response = await GET(new Request(endpoint), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getImage).toHaveBeenCalledWith(userId, recipeId);
    expect((await GET(new Request(endpoint), context)).status).toBe(404);
  });

  it("returns 404 for an unowned recipe on GET, POST, and DELETE", async () => {
    const missing = new RecipeNotFoundError(recipeId);
    getImage.mockRejectedValue(missing);
    saveImportedImage.mockRejectedValue(missing);
    deleteImage.mockRejectedValue(missing);
    expect((await GET(new Request(endpoint), context)).status).toBe(404);
    expect((await POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ importJobId: recipeId }) }), context)).status).toBe(404);
    expect((await DELETE(new Request(endpoint, { method: "DELETE" }), context)).status).toBe(404);
  });

  it("accepts one image file and passes the authenticated user to storage", async () => {
    saveImage.mockResolvedValue(`/api/recipes/${recipeId}/image`);
    const form = new FormData();
    form.set("file", new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], "dish.jpg", { type: "image/jpeg" }));
    const response = await POST(new Request(endpoint, { method: "POST", body: form }), context);
    expect(response.status).toBe(200);
    expect(saveImage).toHaveBeenCalledWith(userId, recipeId, expect.any(Buffer), "image/jpeg");
  });

  it("rejects malformed JSON and oversized upload bodies before saving", async () => {
    const malformed = await POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }), context);
    expect(malformed.status).toBe(400);
    const oversized = await POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body: new Uint8Array(5 * 1024 * 1024 + 64 * 1024 + 1) }), context);
    expect(oversized.status).toBe(413);
    expect(saveImage).not.toHaveBeenCalled();
  });
});
