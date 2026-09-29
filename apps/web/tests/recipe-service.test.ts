import { describe, expect, it, vi } from "vitest";

const { createRecipeMock } = vi.hoisted(() => ({
  createRecipeMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recipe: {
      create: createRecipeMock,
    },
  },
}));

import { createRecipe } from "@/services/recipe-service";

describe("createRecipe", () => {
  it("creates and flattens a recipe with ingredients", async () => {
    const createdAt = new Date("2026-09-24T12:00:00.000Z");
    const updatedAt = new Date("2026-09-24T12:00:00.000Z");
    const persistedRecipe = {
      id: "recipe_1",
      name: "Tomato Soup",
      description: "A quick soup",
      instructions: "Simmer until warm.",
      createdAt,
      updatedAt,
      ingredients: [
        {
          recipeId: "recipe_1",
          ingredientId: "ingredient_1",
          quantity: "2",
          unit: "cans",
          ingredient: {
            id: "ingredient_1",
            name: "Tomatoes",
          },
        },
        {
          recipeId: "recipe_1",
          ingredientId: "ingredient_2",
          quantity: "1/2",
          unit: "cup",
          ingredient: {
            id: "ingredient_2",
            name: "Stock",
          },
        },
        {
          recipeId: "recipe_1",
          ingredientId: "ingredient_3",
          quantity: "1-2",
          unit: "minutes",
          ingredient: {
            id: "ingredient_3",
            name: "Simmer time",
          },
        },
        {
          recipeId: "recipe_1",
          ingredientId: "ingredient_4",
          quantity: "to taste",
          unit: null,
          ingredient: {
            id: "ingredient_4",
            name: "Salt",
          },
        },
      ],
    };

    createRecipeMock.mockResolvedValue(persistedRecipe);

    await expect(createRecipe({
      name: "Tomato Soup",
      description: "A quick soup",
      instructions: "Simmer until warm.",
      ingredients: [
        { name: "Tomatoes", quantity: "2", unit: "cans" },
        { name: "Stock", quantity: "1/2", unit: "cup" },
        { name: "Simmer time", quantity: "1-2", unit: "minutes" },
        { name: "Salt", quantity: "to taste" },
      ],
    })).resolves.toEqual({
      id: "recipe_1",
      name: "Tomato Soup",
      description: "A quick soup",
      instructions: "Simmer until warm.",
      createdAt,
      updatedAt,
      ingredients: [
        { name: "Tomatoes", quantity: "2", unit: "cans" },
        { name: "Stock", quantity: "1/2", unit: "cup" },
        { name: "Simmer time", quantity: "1-2", unit: "minutes" },
        { name: "Salt", quantity: "to taste", unit: null },
      ],
    });

    expect(createRecipeMock).toHaveBeenCalledWith({
      data: {
        name: "Tomato Soup",
        description: "A quick soup",
        instructions: "Simmer until warm.",
        ingredients: {
          create: [
            {
              quantity: "2",
              unit: "cans",
              ingredient: {
                create: {
                  name: "Tomatoes",
                },
              },
            },
            {
              quantity: "1/2",
              unit: "cup",
              ingredient: {
                create: {
                  name: "Stock",
                },
              },
            },
            {
              quantity: "1-2",
              unit: "minutes",
              ingredient: {
                create: {
                  name: "Simmer time",
                },
              },
            },
            {
              quantity: "to taste",
              unit: null,
              ingredient: {
                create: {
                  name: "Salt",
                },
              },
            },
          ],
        },
      },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });
  });
});
