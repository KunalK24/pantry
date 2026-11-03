import { beforeEach, describe, expect, it, vi } from "vitest";

const { importRecipe, extractPantryItems, create } = vi.hoisted(() => ({
  importRecipe: vi.fn(),
  extractPantryItems: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/services/recipe-import-service", () => ({ importRecipe }));
vi.mock("@/services/pantry-extraction-service", () => ({ extractPantryItems }));
vi.mock("@/lib/prisma", () => ({ prisma: { aiJob: { create } } }));

import { extractPantrySynchronously, importRecipeSynchronously } from "@/services/synchronous-import-service";

const draft = {
  name: "Toast",
  instructions: "Toast bread.",
  ingredients: [{ name: "Bread", quantity: "2" }],
};

beforeEach(() => vi.clearAllMocks());

describe("synchronous imports", () => {
  it("returns text recipe drafts without a database job", async () => {
    importRecipe.mockResolvedValue({ draft, imageCandidate: null });
    await expect(importRecipeSynchronously({ type: "text", text: "Toast" }, "user-1"))
      .resolves.toEqual({ draft, imageCandidate: null, importJobId: null });
    expect(create).not.toHaveBeenCalled();
  });

  it("stores only successful source URL image provenance for the owner", async () => {
    const result = { draft, imageCandidate: { kind: "source_url", url: "https://example.com/toast.jpg" } };
    importRecipe.mockResolvedValue(result);
    create.mockResolvedValue({ id: "cm12345678901234567890123" });
    const output = await importRecipeSynchronously({ type: "url", url: "https://example.com" }, "user-1");
    expect(output).toEqual({ ...result, importJobId: "cm12345678901234567890123" });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "RECIPE_IMPORT", status: "SUCCEEDED", sourceType: "url", userId: "user-1",
        resultJson: result, progressMessage: "complete",
      }),
      select: { id: true },
    });
    expect(create.mock.calls[0][0].data.inputJson).toBeUndefined();
  });

  it("returns pantry item drafts without storing the image", async () => {
    const input = { type: "image" as const, image: { mimeType: "image/jpeg" as const, data: "image" } };
    extractPantryItems.mockResolvedValue([{ name: "Carrots" }]);
    await expect(extractPantrySynchronously(input)).resolves.toEqual({ items: [{ name: "Carrots" }] });
    expect(create).not.toHaveBeenCalled();
  });
});
