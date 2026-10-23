import { describe, expect, it } from "vitest";

import { readBoundedJson, RequestTooLargeError } from "@/lib/request-json";
import { groceryListInputSchema } from "@/schemas/grocery-list";
import {
  pantryExtractionSchema,
  pantryItemInputSchema,
} from "@/schemas/pantry-item";
import { recipeInputSchema } from "@/schemas/recipe";
import { weeklyPlanInputSchema } from "@/schemas/weekly-plan";

describe("bounded JSON requests", () => {
  it("reads a body at the byte limit", async () => {
    const request = new Request("http://localhost/api/recipes", {
      method: "POST",
      body: '"é"',
    });

    await expect(readBoundedJson(request, 4)).resolves.toBe("é");
  });

  it("rejects streamed bytes beyond a false Content-Length", async () => {
    const request = new Request("http://localhost/api/recipes", {
      method: "POST",
      headers: { "content-length": "1" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('"é"'));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);

    await expect(readBoundedJson(request, 3)).rejects.toBeInstanceOf(
      RequestTooLargeError,
    );
  });

  it("rejects a declared oversized body before reading it", async () => {
    const request = new Request("http://localhost/api/recipes", {
      method: "POST",
      headers: { "content-length": "5" },
      body: "{}",
    });

    await expect(readBoundedJson(request, 4)).rejects.toBeInstanceOf(
      RequestTooLargeError,
    );
  });

  it("keeps the oversized error when stream cancellation fails", async () => {
    const request = new Request("http://localhost/api/recipes", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('"large"'));
        },
        cancel() {
          return Promise.reject(new Error("Cancellation failed"));
        },
      }),
      duplex: "half",
    } as RequestInit);

    await expect(readBoundedJson(request, 3)).rejects.toBeInstanceOf(
      RequestTooLargeError,
    );
  });
});

describe("request schema limits", () => {
  const ingredient = { name: "Egg", quantity: "1", unit: "piece" };
  const recipe = {
    name: "Omelet",
    description: "Quick",
    instructions: "Cook",
    ingredients: [ingredient],
  };

  it.each([
    ["name", { name: "x".repeat(201) }],
    ["description", { description: "x".repeat(2001) }],
    ["instructions", { instructions: "x".repeat(20001) }],
    [
      "ingredient name",
      { ingredients: [{ ...ingredient, name: "x".repeat(201) }] },
    ],
    [
      "ingredient quantity",
      { ingredients: [{ ...ingredient, quantity: "x".repeat(101) }] },
    ],
    [
      "ingredient unit",
      { ingredients: [{ ...ingredient, unit: "x".repeat(101) }] },
    ],
    [
      "ingredient count",
      {
        ingredients: Array.from({ length: 101 }, (_, index) => ({
          ...ingredient,
          name: `Egg ${index}`,
        })),
      },
    ],
  ])("rejects an oversized recipe %s", (_field, change) => {
    expect(recipeInputSchema.safeParse({ ...recipe, ...change }).success).toBe(
      false,
    );
  });

  it("accepts maximum recipe fields and ingredient count", () => {
    const ingredients = Array.from({ length: 100 }, (_, index) => ({
      name: `${index} ${"x".repeat(196)}`,
      quantity: "x".repeat(100),
      unit: "x".repeat(100),
    }));
    expect(
      recipeInputSchema.safeParse({
        name: "x".repeat(200),
        description: "x".repeat(2000),
        instructions: "x".repeat(20000),
        ingredients,
      }).success,
    ).toBe(true);
  });

  it("limits pantry fields and extracted item count", () => {
    expect(
      pantryItemInputSchema.safeParse({ name: "x".repeat(201) }).success,
    ).toBe(false);
    expect(
      pantryItemInputSchema.safeParse({
        name: "Egg",
        quantity: "x".repeat(101),
      }).success,
    ).toBe(false);
    expect(
      pantryItemInputSchema.safeParse({ name: "Egg", unit: "x".repeat(101) })
        .success,
    ).toBe(false);
    const extractedItems = Array.from({ length: 101 }, () => ({ name: "Egg" }));
    expect(
      pantryExtractionSchema.safeParse({ items: extractedItems }).success,
    ).toBe(false);
    expect(
      pantryExtractionSchema.safeParse({ items: extractedItems.slice(0, 100) })
        .success,
    ).toBe(true);
  });

  it("limits grocery recipes, grocery items, and planned meals", () => {
    const grocery = { importedWeeklyPlanId: null, recipes: [], items: [] };
    const recipeRef = {
      recipeId: "cm12345678901234567890123",
      source: "MANUAL",
    };
    const recipeRefs = Array.from({ length: 201 }, () => recipeRef);
    expect(
      groceryListInputSchema.safeParse({ ...grocery, recipes: recipeRefs })
        .success,
    ).toBe(false);
    expect(
      groceryListInputSchema.safeParse({
        ...grocery,
        recipes: recipeRefs.slice(0, 200),
      }).success,
    ).toBe(true);

    const groceryItem = {
      lineKey: "egg",
      name: "Egg",
      baseQuantity: "1",
      baseUnit: "",
      quantityOverride: null,
      unitOverride: null,
      checked: false,
      dismissed: false,
      pantryItemId: null,
    };
    const groceryItems = Array.from({ length: 1001 }, (_, index) => ({
      ...groceryItem,
      lineKey: String(index),
    }));
    expect(
      groceryListInputSchema.safeParse({ ...grocery, items: groceryItems })
        .success,
    ).toBe(false);
    expect(
      groceryListInputSchema.safeParse({
        ...grocery,
        items: groceryItems.slice(0, 1000),
      }).success,
    ).toBe(true);

    const meals = Array.from({ length: 71 }, (_, index) => ({
      recipeId: recipeRef.recipeId,
      dayOffset: 0,
      position: index,
    }));
    expect(weeklyPlanInputSchema.safeParse({ meals }).success).toBe(false);
    expect(
      weeklyPlanInputSchema.safeParse({ meals: meals.slice(0, 70) }).success,
    ).toBe(true);
  });
});
