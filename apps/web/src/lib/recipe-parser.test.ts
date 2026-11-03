import { describe, expect, it } from "vitest";

import { parseRecipeHtml, RecipeParseError } from "./recipe-parser";

const url = "https://example.com/bread";
const html = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Bread",
  recipeIngredient: ["1 1/2 cups flour", "2 tbsp sugar", "¼ tsp salt"],
  recipeInstructions: ["Mix", "Bake"],
  totalTime: "PT45M",
  recipeCategory: "Breakfast",
})}</script>`;

describe("TypeScript recipe scraper", () => {
  it("maps real library output to a Pantry draft", async () => {
    await expect(parseRecipeHtml(url, html)).resolves.toEqual({
      name: "Bread",
      instructions: "Mix\nBake",
      ingredients: [
        { name: "flour", quantity: "1 1/2", unit: "cups" },
        { name: "sugar", quantity: "2", unit: "tbsp" },
        { name: "salt", quantity: "¼", unit: "tsp" },
      ],
      mealType: "breakfast",
      timeMinutes: 45,
    });
  });

  it("rejects incomplete ingredient data for the existing fallback", async () => {
    const incomplete = html.replace("1 1/2 cups flour", "flour");
    await expect(parseRecipeHtml(url, incomplete)).rejects.toBeInstanceOf(RecipeParseError);
  });

  it("rejects oversized HTML before parsing", async () => {
    await expect(parseRecipeHtml(url, "x".repeat(1024 * 1024 + 1)))
      .rejects.toMatchObject({ code: "invalid_input" });
  });
});
