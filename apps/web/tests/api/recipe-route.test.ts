import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createRecipeMock, listRecipesMock } = vi.hoisted(() => ({
  createRecipeMock: vi.fn(),
  listRecipesMock: vi.fn(),
}));

vi.mock("@/services/recipe-service", () => ({
  createRecipe: createRecipeMock,
  listRecipes: listRecipesMock,
}));

import { GET, POST } from "@/app/api/recipes/route";

describe("POST /api/recipes", () => {
  beforeEach(() => {
    createRecipeMock.mockReset();
    listRecipesMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a complete recipe with textual quantities", async () => {
    const input = {
      name: "Pad Kra Pao",
      description: "A spicy stir-fry",
      instructions: "Stir-fry and serve over rice.",
      ingredients: [
        { name: "Ground pork", quantity: "1/2", unit: "lb" },
        { name: "Thai basil", quantity: "to taste" },
      ],
    };
    const recipe = {
      id: "recipe_1",
      ...input,
      ingredients: [
        { name: "Ground pork", quantity: "1/2", unit: "lb" },
        { name: "Thai basil", quantity: "to taste", unit: null },
      ],
      createdAt: "2026-09-24T12:00:00.000Z",
      updatedAt: "2026-09-24T12:00:00.000Z",
    };

    createRecipeMock.mockResolvedValue(recipe);

    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify(input),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual(recipe);
    expect(createRecipeMock).toHaveBeenCalledWith(input);
  });

  it("rejects missing ingredients", async () => {
    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        name: "Toast",
        instructions: "Toast the bread.",
        ingredients: [],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it("rejects blank instructions", async () => {
    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        name: "Toast",
        instructions: "   ",
        ingredients: [{ name: "Bread", quantity: "2", unit: "slices" }],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["recipe name", {
      name: "   ",
      instructions: "Toast the bread.",
      ingredients: [{ name: "Bread", quantity: "2", unit: "slices" }],
    }],
    ["ingredient name", {
      name: "Toast",
      instructions: "Toast the bread.",
      ingredients: [{ name: "   ", quantity: "2", unit: "slices" }],
    }],
  ])("rejects a blank %s", async (_field, input) => {
    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify(input),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it.each(["2", "1/2", "1-2", "to taste"])(
    "accepts the textual quantity %s",
    async (quantity) => {
      const input = {
        name: "Toast",
        instructions: "Toast the bread.",
        ingredients: [{ name: "Bread", quantity }],
      };
      createRecipeMock.mockResolvedValue({ id: "recipe_1", ...input });

      const request = new Request("http://localhost:3000/api/recipes", {
        method: "POST",
        body: JSON.stringify(input),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(createRecipeMock).toHaveBeenCalledWith(input);
    },
  );

  it("rejects a numeric quantity", async () => {
    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        name: "Toast",
        instructions: "Toast the bread.",
        ingredients: [{ name: "Bread", quantity: 2, unit: "slices" }],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it("rejects an empty textual quantity", async () => {
    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        name: "Toast",
        instructions: "Toast the bread.",
        ingredients: [{ name: "Bread", quantity: "   " }],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate ingredient names after trimming without regard to case", async () => {
    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        name: "Seasoned Tomatoes",
        instructions: "Combine everything.",
        ingredients: [
          { name: "Salt", quantity: "1/2", unit: "tsp" },
          { name: " salt ", quantity: "to taste" },
        ],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid Recipe");
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it("rejects alias-equivalent duplicate ingredient names", async () => {
    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        name: "Green Onion Pancakes",
        instructions: "Mix and fry.",
        ingredients: [
          { name: "Scallions", quantity: "2", unit: "bunches" },
          { name: "green onions", quantity: "1", unit: "bunch" },
        ],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it("does not treat descriptive ingredient phrases as aliases", async () => {
    createRecipeMock.mockResolvedValue({ id: "recipe_1" });
    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        name: "Green Onion Pancakes",
        instructions: "Mix and fry.",
        ingredients: [
          { name: "Fresh scallions", quantity: "2", unit: "bunches" },
          { name: "green onion", quantity: "1", unit: "bunch" },
        ],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(createRecipeMock).toHaveBeenCalledOnce();
  });

  it("returns 400 for malformed JSON", async () => {
    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: "{",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Malformed JSON" });
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it("returns a generic 500 response when creation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createRecipeMock.mockRejectedValue(new Error("database connection failed"));

    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        name: "Toast",
        instructions: "Toast the bread.",
        ingredients: [{ name: "Bread", quantity: "2", unit: "slices" }],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal Server Error",
    });
  });
});

describe("GET /api/recipes", () => {
  beforeEach(() => {
    listRecipesMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["an empty library", []],
    ["a populated library", [{
      id: "recipe_1",
      name: "Tomato Soup",
      description: "A quick soup",
      updatedAt: "2026-09-25T12:00:00.000Z",
    }]],
  ])("returns %s", async (_case, recipes) => {
    listRecipesMock.mockResolvedValue(recipes);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ recipes });
    expect(listRecipesMock).toHaveBeenCalledOnce();
  });

  it("returns a generic 500 when listing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    listRecipesMock.mockRejectedValue(new Error("database details"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal Server Error",
    });
  });
});
