import { describe, expect, it } from "vitest";

import { planIngredientDetailsBackfill } from "../scripts/backfill-ingredient-details";

describe("ingredient details backfill", () => {
  it("uses recipe package context for product forms and is idempotent", () => {
    const ingredients = [
      { id: "crushed", name: "crushed tomatoes (undrained)", normalizedName: "tomatoes (undrained)" },
      { id: "diced", name: "diced tomatoes", normalizedName: "tomatoes" },
    ];
    const recipeLines = [
      {
        recipeId: "recipe-1",
        ingredientId: "crushed",
        name: ingredients[0].name,
        quantity: "1",
        unit: "can",
        brand: null,
        modifiers: [],
        packageQuantity: "14",
        packageUnit: "oz",
      },
      {
        recipeId: "recipe-2",
        ingredientId: "diced",
        name: ingredients[1].name,
        quantity: "1",
        unit: "can",
        brand: null,
        modifiers: [],
        packageQuantity: "14",
        packageUnit: "oz",
      },
    ];

    const plan = planIngredientDetailsBackfill(ingredients, recipeLines, []);
    expect(plan.ingredientUpdates).toEqual([
      { id: "crushed", normalizedName: "crushed tomatoes" },
      { id: "diced", normalizedName: "diced tomatoes" },
    ]);
    expect(plan.recipeIngredientUpdates).toEqual([{
      recipeId: "recipe-1",
      ingredientId: "crushed",
      quantity: "1",
      unit: "can",
      brand: null,
      modifiers: ["undrained"],
      packageQuantity: "14",
      packageUnit: "oz",
    }]);

    const repeated = planIngredientDetailsBackfill(
      ingredients.map((ingredient) => ({
        ...ingredient,
        normalizedName: plan.ingredientUpdates.find((update) => update.id === ingredient.id)?.normalizedName ?? ingredient.normalizedName,
      })),
      recipeLines.map((line) => ({
        ...line,
        ...(plan.recipeIngredientUpdates.find((update) => update.ingredientId === line.ingredientId) ?? {}),
      })),
      [],
    );
    expect(repeated.ingredientUpdates).toEqual([]);
    expect(repeated.recipeIngredientUpdates).toEqual([]);
    expect(ingredients[0].name).toBe("crushed tomatoes (undrained)");
    expect(ingredients[1].name).toBe("diced tomatoes");
  });

  it("plans structured updates without changing original names and becomes a no-op on repetition", () => {
    const ingredients = [{ id: "ingredient-1", name: "15-ounce can Black beans", normalizedName: "15-ounce can black beans" }];
    const recipeLines = [{
      recipeId: "recipe-1",
      ingredientId: "ingredient-1",
      name: ingredients[0].name,
      quantity: "1",
      unit: null,
      brand: null,
      modifiers: [],
      packageQuantity: null,
      packageUnit: null,
    }];
    const pantryItems = [{
      id: "pantry-1",
      name: "2 cans of Black Beans",
      normalizedName: "2 cans of black beans",
      quantity: null,
      unit: null,
      brand: null,
      modifiers: [],
      packageQuantity: null,
      packageUnit: null,
    }];

    const plan = planIngredientDetailsBackfill(ingredients, recipeLines, pantryItems);
    expect(plan.ingredientUpdates).toEqual([{ id: "ingredient-1", normalizedName: "black beans" }]);
    expect(plan.recipeIngredientUpdates).toEqual([{
      recipeId: "recipe-1",
      ingredientId: "ingredient-1",
      quantity: "1",
      unit: "can",
      brand: null,
      modifiers: [],
      packageQuantity: "15",
      packageUnit: "oz",
    }]);
    expect(plan.pantryItemUpdates).toEqual([{
      id: "pantry-1",
      normalizedName: "black beans",
      quantity: "2",
      unit: "can",
      brand: null,
      modifiers: [],
      packageQuantity: null,
      packageUnit: null,
    }]);
    expect(plan.unknownPackageSizes).toEqual([{ id: "pantry-1", name: "2 cans of Black Beans" }]);

    const repeated = planIngredientDetailsBackfill(
      [{ ...ingredients[0], ...plan.ingredientUpdates[0] }],
      [{ ...recipeLines[0], ...plan.recipeIngredientUpdates[0] }],
      [{ ...pantryItems[0], ...plan.pantryItemUpdates[0] }],
    );
    expect(repeated.ingredientUpdates).toEqual([]);
    expect(repeated.recipeIngredientUpdates).toEqual([]);
    expect(repeated.pantryItemUpdates).toEqual([]);
    expect(ingredients[0].name).toBe("15-ounce can Black beans");
    expect(pantryItems[0].name).toBe("2 cans of Black Beans");
  });
});
