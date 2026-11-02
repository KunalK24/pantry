import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import RecipeLibrary, { filterRecipes } from "@/components/RecipeLibrary";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

type RecipeSummary = Parameters<typeof filterRecipes>[0][number];

function recipe(id: string, name: string, mealType: RecipeSummary["mealType"], ingredient: string): RecipeSummary {
  return {
    id,
    name,
    mealType,
    description: null,
    updatedAt: "2026-11-01T00:00:00.000Z",
    imageUrl: null,
    timeMinutes: 20,
    isFavorite: false,
    ingredients: [{ name: ingredient, quantity: "1", unit: null }],
  };
}

describe("recipe library UI", () => {
  it("renders all meal type filter choices as accessible buttons", () => {
    const markup = renderToStaticMarkup(<RecipeLibrary />);

    expect(markup).toContain('aria-label="Filter recipes by meal type"');
    for (const label of ["All recipes", "breakfast", "lunch", "dinner", "snack"]) {
      expect(markup).toContain(`>${label}</button>`);
    }
  });

  it("composes meal type and ingredient search, including untagged recipes in all", () => {
    const recipes = [
      recipe("1", "Oat bowl", "breakfast", "Oats"),
      recipe("2", "Tomato toast", "lunch", "Tomato"),
      recipe("3", "Tomato soup", "dinner", "Tomato"),
      recipe("4", "Tomato snack", null, "Tomato"),
    ];

    expect(filterRecipes(recipes, " tomato ", "lunch").map((item) => item.id)).toEqual(["2"]);
    expect(filterRecipes(recipes, "tomato", "all").map((item) => item.id)).toEqual(["2", "3", "4"]);
    expect(filterRecipes(recipes, "", "breakfast").map((item) => item.id)).toEqual(["1"]);
  });
});
