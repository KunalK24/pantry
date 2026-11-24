import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import PantryItemForm from "@/components/PantryItemForm";
import RecipeForm from "@/components/RecipeForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined, refresh: () => undefined }),
}));

describe("ingredient form names and matching details", () => {
  it("keeps the original recipe ingredient name visible while showing parsed details", () => {
    const markup = renderToStaticMarkup(
      <RecipeForm
        initialValues={{
          name: "Bean salad",
          instructions: ["Mix the ingredients."],
          ingredients: [{
            name: "ALDI's Black Beans, finely chopped",
            quantity: "1",
            unit: "can",
            brand: "ALDI's",
            modifiers: ["finely chopped"],
            packageQuantity: "15",
            packageUnit: "oz",
          }],
        }}
      />,
    );

    expect(markup).toContain('value="ALDI&#x27;s Black Beans, finely chopped"');
    expect(markup).toContain('value="ALDI&#x27;s"');
    expect(markup).toContain('value="finely chopped"');
    expect(markup).toContain('value="15"');
  });

  it("keeps the original pantry item name visible in edit mode", () => {
    const markup = renderToStaticMarkup(
      <PantryItemForm
        mode="edit"
        pantryItemId="item-1"
        initialValues={{
          name: "Kroger's garbanzo beans",
          quantity: "2",
          unit: "cans",
          brand: "Kroger's",
          modifiers: [],
          packageQuantity: "15",
          packageUnit: "oz",
          location: "Pantry",
          expiresOn: "",
        }}
      />,
    );

    expect(markup).toContain('value="Kroger&#x27;s garbanzo beans"');
    expect(markup).toContain('value="Kroger&#x27;s"');
    expect(markup).toContain('value="15"');
  });
});
