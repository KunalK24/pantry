import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ExtractionPantryDialog from "@/components/ExtractionPantryDialog";

describe("pantry import UI", () => {
  it("offers an image-only upload with a review action before any items can be saved", () => {
    const markup = renderToStaticMarkup(
      <ExtractionPantryDialog onPantryItemsCreated={() => undefined} />,
    );

    expect(markup).toContain("Import from image");
    expect(markup).toContain('<dialog');
    expect(markup).toContain('aria-labelledby="pantry-import-title"');
    expect(markup).toContain('type="file"');
    expect(markup).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(markup).not.toContain('type="url"');
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("Save selected items");
  });
});
