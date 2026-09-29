import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getRecipeByIdMock,
  updateRecipeMock,
  RecipeNotFoundErrorMock,
} = vi.hoisted(() => {
  class RecipeNotFoundErrorMock extends Error {}

  return {
    getRecipeByIdMock: vi.fn(),
    updateRecipeMock: vi.fn(),
    RecipeNotFoundErrorMock,
  };
});

vi.mock("@/services/recipe-service", () => ({
  getRecipeById: getRecipeByIdMock,
  updateRecipe: updateRecipeMock,
  RecipeNotFoundError: RecipeNotFoundErrorMock,
}));

import { GET, PUT } from "@/app/api/recipes/[id]/route";

const recipeId = "cm12345678901234567890123";
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
    expect(getRecipeByIdMock).toHaveBeenCalledWith(recipeId);
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
    expect(updateRecipeMock).toHaveBeenCalledWith(recipeId, input);
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
