import { describe, expect, it, vi } from "vitest";

const { createRecipeMock } = vi.hoisted(() => ({
  createRecipeMock: vi.fn(),
}));

vi.mock("@/services/recipe-service", () => ({
  createRecipe: createRecipeMock,
}));

import { POST } from "@/app/api/recipes/route";

describe("POST /api/recipes", () => {
  it("creates a recipe", async () => {
    const recipe = {
      id: "recipe_1",
      name: "Pad Kra Pao",
      createdAt: "2026-09-24T12:00:00.000Z",
      updatedAt: "2026-09-24T12:00:00.000Z",
    };

    createRecipeMock.mockResolvedValue(recipe);

    const request = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      body: JSON.stringify({ name: "Pad Kra Pao" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(recipe);
    expect(createRecipeMock).toHaveBeenCalledWith({ name: "Pad Kra Pao" });
  });
});
