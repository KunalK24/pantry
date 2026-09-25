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
  it("creates a simple recipe", async () => {
    const recipe = {
      id: "recipe_1",
      name: "Tomato Soup",
      createdAt: new Date("2026-09-24T12:00:00.000Z"),
      updatedAt: new Date("2026-09-24T12:00:00.000Z"),
    };

    createRecipeMock.mockResolvedValue(recipe);

    await expect(createRecipe({ name: "Tomato Soup" })).resolves.toEqual(recipe);

    expect(createRecipeMock).toHaveBeenCalledWith({
      data: {
        name: "Tomato Soup",
      },
    });
  });
});
