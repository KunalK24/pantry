import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRecipeMock,
  findManyRecipesMock,
  findRecipeByIdMock,
  transactionMock,
  transactionFindRecipeMock,
  transactionUpdateRecipeMock,
  transactionDeleteRecipeIngredientsMock,
  transactionDeleteIngredientsMock,
} = vi.hoisted(() => ({
  createRecipeMock: vi.fn(),
  findManyRecipesMock: vi.fn(),
  findRecipeByIdMock: vi.fn(),
  transactionMock: vi.fn(),
  transactionFindRecipeMock: vi.fn(),
  transactionUpdateRecipeMock: vi.fn(),
  transactionDeleteRecipeIngredientsMock: vi.fn(),
  transactionDeleteIngredientsMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recipe: {
      create: createRecipeMock,
      findMany: findManyRecipesMock,
      findUnique: findRecipeByIdMock,
    },
    $transaction: transactionMock,
  },
}));

import {
  createRecipe,
  getRecipeById,
  listRecipes,
  RecipeNotFoundError,
  updateRecipe,
} from "@/services/recipe-service";
import { Prisma } from "@/generated/prisma/client";

const completeRecipe = {
  id: "cm12345678901234567890123",
  name: "Tomato Soup",
  description: "A quick soup",
  instructions: "Simmer until warm.",
  createdAt: new Date("2026-09-24T12:00:00.000Z"),
  updatedAt: new Date("2026-09-25T12:00:00.000Z"),
  ingredients: [
    {
      recipeId: "cm12345678901234567890123",
      ingredientId: "ingredient_new_1",
      quantity: "2 cans",
      unit: null,
      ingredient: {
        id: "ingredient_new_1",
        name: "Tomatoes",
      },
    },
    {
      recipeId: "cm12345678901234567890123",
      ingredientId: "ingredient_new_2",
      quantity: "to taste",
      unit: null,
      ingredient: {
        id: "ingredient_new_2",
        name: "Salt",
      },
    },
  ],
};

const flattenedRecipe = {
  id: completeRecipe.id,
  name: completeRecipe.name,
  description: completeRecipe.description,
  instructions: completeRecipe.instructions,
  createdAt: completeRecipe.createdAt,
  updatedAt: completeRecipe.updatedAt,
  ingredients: [
    { name: "Tomatoes", quantity: "2 cans", unit: null },
    { name: "Salt", quantity: "to taste", unit: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();

  transactionMock.mockImplementation(async (operation) => operation({
    recipe: {
      findUnique: transactionFindRecipeMock,
      update: transactionUpdateRecipeMock,
    },
    recipeIngredient: {
      deleteMany: transactionDeleteRecipeIngredientsMock,
    },
    ingredient: {
      deleteMany: transactionDeleteIngredientsMock,
    },
  }));
});

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

describe("listRecipes", () => {
  it("returns recipe summaries using newest-updated ordering", async () => {
    const recipes = [
      {
        id: "recipe_2",
        name: "New recipe",
        description: null,
        updatedAt: new Date("2026-09-25T12:00:00.000Z"),
      },
      {
        id: "recipe_1",
        name: "Old recipe",
        description: "Earlier",
        updatedAt: new Date("2026-09-24T12:00:00.000Z"),
      },
    ];
    findManyRecipesMock.mockResolvedValue(recipes);

    await expect(listRecipes()).resolves.toEqual(recipes);
    expect(findManyRecipesMock).toHaveBeenCalledWith({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        updatedAt: true,
      },
    });
  });
});

describe("getRecipeById", () => {
  it("loads and flattens a complete recipe", async () => {
    findRecipeByIdMock.mockResolvedValue(completeRecipe);

    await expect(getRecipeById(completeRecipe.id)).resolves.toEqual(flattenedRecipe);
    expect(findRecipeByIdMock).toHaveBeenCalledWith({
      where: { id: completeRecipe.id },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });
  });

  it("throws the domain error when the recipe does not exist", async () => {
    findRecipeByIdMock.mockResolvedValue(null);

    await expect(getRecipeById(completeRecipe.id)).rejects.toBeInstanceOf(
      RecipeNotFoundError,
    );
  });
});

describe("updateRecipe", () => {
  it("atomically replaces fields and ingredients, then removes old orphans", async () => {
    const input = {
      name: "Tomato Soup",
      description: "A quick soup",
      instructions: "Simmer until warm.",
      ingredients: [
        { name: "Tomatoes", quantity: "2 cans" },
        { name: "Salt", quantity: "to taste" },
      ],
    };
    transactionFindRecipeMock.mockResolvedValue({
      ingredients: [
        { ingredientId: "ingredient_old_1" },
        { ingredientId: "ingredient_old_2" },
      ],
    });
    transactionUpdateRecipeMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(completeRecipe);
    transactionDeleteRecipeIngredientsMock.mockResolvedValue({ count: 2 });
    transactionDeleteIngredientsMock.mockResolvedValue({ count: 2 });

    await expect(updateRecipe(completeRecipe.id, input)).resolves.toEqual(
      flattenedRecipe,
    );

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(transactionFindRecipeMock).toHaveBeenCalledWith({
      where: { id: completeRecipe.id },
      select: {
        ingredients: {
          select: { ingredientId: true },
        },
      },
    });
    expect(transactionUpdateRecipeMock).toHaveBeenNthCalledWith(1, {
      where: { id: completeRecipe.id },
      data: {
        name: input.name,
        description: input.description,
        instructions: input.instructions,
      },
    });
    expect(transactionDeleteRecipeIngredientsMock).toHaveBeenCalledWith({
      where: { recipeId: completeRecipe.id },
    });
    expect(transactionUpdateRecipeMock).toHaveBeenNthCalledWith(2, {
      where: { id: completeRecipe.id },
      data: {
        ingredients: {
          create: [
            {
              quantity: "2 cans",
              unit: null,
              ingredient: { create: { name: "Tomatoes" } },
            },
            {
              quantity: "to taste",
              unit: null,
              ingredient: { create: { name: "Salt" } },
            },
          ],
        },
      },
      include: {
        ingredients: {
          include: { ingredient: true },
        },
      },
    });
    expect(transactionDeleteIngredientsMock).toHaveBeenCalledWith({
      where: {
        id: { in: ["ingredient_old_1", "ingredient_old_2"] },
        recipes: { none: {} },
      },
    });
  });

  it("throws before writing when the recipe does not exist", async () => {
    transactionFindRecipeMock.mockResolvedValue(null);

    await expect(
      updateRecipe(completeRecipe.id, {
        name: "Missing",
        instructions: "None",
        ingredients: [{ name: "Salt", quantity: "to taste" }],
      }),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    expect(transactionUpdateRecipeMock).not.toHaveBeenCalled();
    expect(transactionDeleteRecipeIngredientsMock).not.toHaveBeenCalled();
  });

  it("reports a not-found result when the recipe disappears before updating", async () => {
    transactionFindRecipeMock.mockResolvedValue({
      ingredients: [{ ingredientId: "ingredient_old_1" }],
    });
    transactionUpdateRecipeMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record to update not found", {
        code: "P2025",
        clientVersion: "7.10.0",
      }),
    );

    await expect(
      updateRecipe(completeRecipe.id, {
        name: "Tomato Soup",
        instructions: "Simmer.",
        ingredients: [{ name: "Salt", quantity: "to taste" }],
      }),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    expect(transactionDeleteRecipeIngredientsMock).not.toHaveBeenCalled();
    expect(transactionDeleteIngredientsMock).not.toHaveBeenCalled();
  });

  it("propagates non-not-found Prisma errors unchanged", async () => {
    transactionFindRecipeMock.mockResolvedValue({
      ingredients: [{ ingredientId: "ingredient_old_1" }],
    });
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "7.10.0",
      },
    );
    transactionUpdateRecipeMock.mockRejectedValue(prismaError);

    await expect(
      updateRecipe(completeRecipe.id, {
        name: "Tomato Soup",
        instructions: "Simmer.",
        ingredients: [{ name: "Salt", quantity: "to taste" }],
      }),
    ).rejects.toBe(prismaError);

    expect(transactionDeleteRecipeIngredientsMock).not.toHaveBeenCalled();
    expect(transactionDeleteIngredientsMock).not.toHaveBeenCalled();
  });

  it("propagates transaction failures", async () => {
    transactionMock.mockRejectedValue(new Error("transaction rolled back"));

    await expect(
      updateRecipe(completeRecipe.id, {
        name: "Tomato Soup",
        instructions: "Simmer.",
        ingredients: [{ name: "Salt", quantity: "to taste" }],
      }),
    ).rejects.toThrow("transaction rolled back");
  });
});
