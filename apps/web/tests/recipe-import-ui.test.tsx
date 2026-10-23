import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ImportRecipeDialog from "@/components/ImportRecipeDialog";
import RecipeForm from "@/components/RecipeForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("recipe import UI", () => {
  it("renders the recipe import action, native dialog, and source modes", () => {
    const markup = renderToStaticMarkup(
      <ImportRecipeDialog onRecipeCreated={() => undefined} />,
    );

    expect(markup).toContain("Import recipe");
    expect(markup).toContain("<dialog");
    expect(markup).toContain('aria-labelledby="import-recipe-dialog-title"');
    expect(markup).toContain('name="recipe-import-mode"');
    expect(markup).toContain('value="text"');
    expect(markup).toContain('value="image"');
    expect(markup).toContain('value="url"');
    expect(markup).toContain("Recipe text");
    expect(markup).toContain(
      "Recipe sources are sent to Google Gemini for conversion. Review the draft before saving.",
    );
    expect(markup).toContain("Review recipe");
  });

  it("prefills the create form with a parsed recipe draft", () => {
    const markup = renderToStaticMarkup(
      <RecipeForm
        initialValues={{
          name: "French Toast",
          description: "A quick breakfast",
          instructions: "Whisk, soak, and cook.",
          ingredients: [
            { name: "Bread", quantity: "2", unit: "slices" },
            { name: "Egg", quantity: "1" },
          ],
        }}
      />,
    );

    expect(markup).toContain('value="French Toast"');
    expect(markup).toContain("A quick breakfast");
    expect(markup).toContain("Whisk, soak, and cook.");
    expect(markup).toContain('value="Bread"');
    expect(markup).toContain('value="2"');
    expect(markup).toContain('value="slices"');
    expect(markup).toContain('value="Egg"');
    expect(markup).toContain('value="1"');
    expect(markup).toContain("Save recipe");
  });
});
