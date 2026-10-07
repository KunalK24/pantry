import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getRecipeByIdMock,
  updateRecipeMock,
  deleteRecipeMock,
  RecipeNotFoundErrorMock,
  requireAuthMock,
} = vi.hoisted(() => {
  class RecipeNotFoundErrorMock extends Error {}

  return {
    getRecipeByIdMock: vi.fn(),
    updateRecipeMock: vi.fn(),
    deleteRecipeMock: vi.fn(),
    RecipeNotFoundErrorMock,
    requireAuthMock: vi.fn(),
  };
});

vi.mock("@/services/recipe-service", () => ({
  getRecipeById: getRecipeByIdMock,
  updateRecipe: updateRecipeMock,
  deleteRecipe: deleteRecipeMock,
  RecipeNotFoundError: RecipeNotFoundErrorMock,
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: requireAuthMock,
}));

import { DELETE, GET, PUT } from "@/app/api/recipes/[id]/route";

const recipeId = "cm12345678901234567890123";
const userId = "auth-user";
const authUser = { id: userId, email: "cook@example.com" };
const context = (id = recipeId) => ({ params: Promise.resolve({ id }) });
const input = {
  name: "Updated Tomato Soup",
  description: "Now with basil",
  instructions: "Simmer, blend, and serve.",
  ingredients: [
    { name: "Tomatoes", quantity: "2 cans" },
    { name: "Basil", quantity: "1/2", unit: "cup" },
    { name: "Salt", quantity: "to taste" },
  ],
};
const recipe = {
  id: recipeId,
  ...input,
  ingredients: [
    { name: "Tomatoes", quantity: "2 cans", unit: null },
    { name: "Basil", quantity: "1/2", unit: "cup" },
    { name: "Salt", quantity: "to taste", unit: null },
  ],
  createdAt: "2026-09-24T12:00:00.000Z",
  updatedAt: "2026-09-25T12:00:00.000Z",
};

beforeEach(() => {
  getRecipeByIdMock.mockReset();
  updateRecipeMock.mockReset();
  deleteRecipeMock.mockReset();
  requireAuthMock.mockReset();
  requireAuthMock.mockResolvedValue({ user: authUser, response: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/recipes/[id]", () => {
  it("returns a complete recipe", async () => {
    getRecipeByIdMock.mockResolvedValue(recipe);

    const response = await GET(
      new Request(`http://localhost:3000/api/recipes/${recipeId}`),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(recipe);
    expect(getRecipeByIdMock).toHaveBeenCalledWith(userId, recipeId);
  });

  it("returns 400 for a malformed recipe ID", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/recipes/not-a-cuid"),
      context("not-a-cuid"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid recipe ID" });
    expect(getRecipeByIdMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the recipe does not exist", async () => {
    getRecipeByIdMock.mockRejectedValue(new RecipeNotFoundErrorMock());

    const response = await GET(
      new Request(`http://localhost:3000/api/recipes/${recipeId}`),
      context(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Recipe not found" });
  });

  it("does not expose unexpected errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getRecipeByIdMock.mockRejectedValue(new Error("database details"));

    const response = await GET(
      new Request(`http://localhost:3000/api/recipes/${recipeId}`),
      context(),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal Server Error",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuthMock.mockResolvedValue({
      user: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(
      new Request(`http://localhost:3000/api/recipes/${recipeId}`),
      context(),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getRecipeByIdMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/recipes/[id]", () => {
  it("replaces every editable field and ingredient", async () => {
    updateRecipeMock.mockResolvedValue(recipe);
    const request = new Request(`http://localhost:3000/api/recipes/${recipeId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });

    const response = await PUT(request, context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(recipe);
    expect(updateRecipeMock).toHaveBeenCalledWith(userId, recipeId, input);
  });

  it("returns 400 for a malformed ID before reading the body", async () => {
    const request = new Request("http://localhost:3000/api/recipes/invalid", {
      method: "PUT",
      body: "{",
    });

    const response = await PUT(request, context("invalid"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid recipe ID" });
    expect(updateRecipeMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const request = new Request(`http://localhost:3000/api/recipes/${recipeId}`, {
      method: "PUT",
      body: "{",
    });

    const response = await PUT(request, context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Malformed JSON" });
    expect(updateRecipeMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid complete recipe input", async () => {
    const request = new Request(`http://localhost:3000/api/recipes/${recipeId}`, {
      method: "PUT",
      body: JSON.stringify({ ...input, ingredients: [] }),
    });

    const response = await PUT(request, context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid Recipe" });
    expect(updateRecipeMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the recipe disappears before update", async () => {
    updateRecipeMock.mockRejectedValue(new RecipeNotFoundErrorMock());
    const request = new Request(`http://localhost:3000/api/recipes/${recipeId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });

    const response = await PUT(request, context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Recipe not found" });
  });

  it("does not expose update failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    updateRecipeMock.mockRejectedValue(new Error("transaction details"));
    const request = new Request(`http://localhost:3000/api/recipes/${recipeId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });

    const response = await PUT(request, context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal Server Error",
    });
  });
});

describe("DELETE /api/recipes/[id]", () => {
  it("returns the deleted recipe", async () => {
    deleteRecipeMock.mockResolvedValue(recipe);
    const request = new Request(
      `http://localhost:3000/api/recipes/${recipeId}`,
      { method: "DELETE" },
    );

    const response = await DELETE(request, context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(recipe);
    expect(deleteRecipeMock).toHaveBeenCalledWith(userId, recipeId);
  });

  it("returns 400 for a malformed recipe ID without calling the service", async () => {
    const request = new Request(
      "http://localhost:3000/api/recipes/not-a-cuid",
      { method: "DELETE" },
    );

    const response = await DELETE(request, context("not-a-cuid"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid recipe ID" });
    expect(deleteRecipeMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the recipe does not exist", async () => {
    deleteRecipeMock.mockRejectedValue(new RecipeNotFoundErrorMock());
    const request = new Request(
      `http://localhost:3000/api/recipes/${recipeId}`,
      { method: "DELETE" },
    );

    const response = await DELETE(request, context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Recipe not found" });
  });

  it("returns a generic 500 for unexpected deletion failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    deleteRecipeMock.mockRejectedValue(new Error("database details"));
    const request = new Request(
      `http://localhost:3000/api/recipes/${recipeId}`,
      { method: "DELETE" },
    );

    const response = await DELETE(request, context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal Server Error",
    });
  });
});
