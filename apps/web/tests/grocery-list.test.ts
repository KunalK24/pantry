import { describe, expect, it } from "vitest";

import {
  calculateGroceryLines,
  normalizeGroceryText,
  type PantryItemForGroceryList,
  type RecipeForGroceryList,
} from "@/lib/grocery-list";

function recipe(
  id: string,
  ingredients: RecipeForGroceryList["ingredients"],
): RecipeForGroceryList {
  return { id, name: `Recipe ${id}`, ingredients };
}

function pantryItem(
  id: string,
  name: string,
  quantity: string | null,
  unit: string | null,
): PantryItemForGroceryList {
  return { id, name, quantity, unit };
}

describe("normalizeGroceryText", () => {
  it("trims, collapses whitespace, and lowercases without semantic normalization", () => {
    expect(normalizeGroceryText("  Olive\t  OIL\n")).toBe("olive oil");
    expect(normalizeGroceryText("Scallion")).toBe("scallion");
    expect(normalizeGroceryText("Green Onion")).toBe("green onion");
  });
});

describe("calculateGroceryLines quantity arithmetic", () => {
  it.each([
    ["2", "2"],
    ["1.5", "1 1/2"],
    ["0.50", "1/2"],
    ["3/4", "3/4"],
    ["1 1/2", "1 1/2"],
    ["7/4", "1 3/4"],
    ["0", "0"],
  ])("parses and simplifies %s", (quantity, expected) => {
    const lines = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Flour", quantity, unit: "cup" }])],
      [],
      new Set(),
    );

    if (expected === "0") {
      expect(lines).toEqual([]);
    } else {
      expect(lines[0]).toMatchObject({
        quantity: expected,
        calculation: "computed",
      });
    }
  });

  it.each([
    "",
    "   ",
    "-1",
    "-1/2",
    "1/0",
    "1 1/0",
    "1-2",
    "1 cup",
    "about 3",
    "one",
    ".5",
    "1.",
    "1/2 cup",
  ])("keeps invalid or free-form quantity %j unresolved", (quantity) => {
    const [line] = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Flour", quantity, unit: "cup" }])],
      [],
      new Set(),
    );

    expect(line).toMatchObject({
      quantity: quantity.trim(),
      calculation: "unresolved",
      warning: "This amount could not be compared with pantry stock.",
    });
  });

  it("treats a null recipe quantity as unresolved", () => {
    const [line] = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Salt", quantity: null, unit: null }])],
      [],
      new Set(),
    );

    expect(line).toMatchObject({ quantity: "", calculation: "unresolved" });
  });

  it("aggregates normalized ingredients across recipes and subtracts pantry once", () => {
    const lines = calculateGroceryLines(
      [
        recipe("recipe-b", [{ name: " FLOUR ", quantity: "1/2", unit: " Cup " }]),
        recipe("recipe-a", [{ name: "Flour", quantity: "1", unit: "cup" }]),
      ],
      [pantryItem("pantry-flour", "flour", "1/2", "CUP")],
      new Set(),
    );

    expect(lines).toEqual([
      expect.objectContaining({
        name: "Flour",
        quantity: "1",
        unit: "Cup",
        recipeIds: ["recipe-a", "recipe-b"],
        calculation: "computed",
      }),
    ]);
  });

  it.each(["1 1/2", "2"])(
    "omits a line when pantry stock %s equals or exceeds the requirement",
    (quantity) => {
      expect(calculateGroceryLines(
        [recipe("recipe-a", [{ name: "Flour", quantity: "1 1/2", unit: "cup" }])],
        [pantryItem("pantry-flour", "Flour", quantity, "cup")],
        new Set(),
      )).toEqual([]);
    },
  );

  it.each([null, "", "to taste"])(
    "does not subtract missing or unparseable pantry stock %j",
    (quantity) => {
      const [line] = calculateGroceryLines(
        [recipe("recipe-a", [{ name: "Salt", quantity: "2", unit: "tsp" }])],
        [pantryItem("pantry-salt", "Salt", quantity, "tsp")],
        new Set(),
      );

      expect(line.quantity).toBe("2");
    },
  );

  it("aggregates duplicate normalized pantry names before subtracting", () => {
    const [line] = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Rice", quantity: "3", unit: "cup" }])],
      [
        pantryItem("pantry-a", " Rice ", "1/2", "cup"),
        pantryItem("pantry-b", "RICE", "1", " CUP "),
      ],
      new Set(),
    );

    expect(line.quantity).toBe("1 1/2");
  });
});

describe("calculateGroceryLines matching and fallback behavior", () => {
  it("keeps missing and incompatible units in separate computed lines", () => {
    const lines = calculateGroceryLines(
      [recipe("recipe-a", [
        { name: "Milk", quantity: "1", unit: "cup" },
        { name: "Milk", quantity: "2", unit: "tbsp" },
        { name: "Milk", quantity: "3", unit: null },
      ])],
      [pantryItem("pantry-milk", "Milk", "1", "CUP")],
      new Set(),
    );

    expect(lines.map(({ quantity, unit }) => ({ quantity, unit }))).toEqual([
      { quantity: "3", unit: "" },
      { quantity: "2", unit: "tbsp" },
    ]);
  });

  it("does not treat singular and plural units as aliases", () => {
    const [line] = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Beans", quantity: "2", unit: "cans" }])],
      [pantryItem("pantry-beans", "Beans", "1", "can")],
      new Set(),
    );

    expect(line.quantity).toBe("2");
  });

  it("matches predetermined ingredient aliases", () => {
    const [line] = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Scallion", quantity: "2", unit: null }])],
      [pantryItem("pantry-onion", "Green onion", "1", null)],
      new Set(),
    );

    expect(line).toMatchObject({ name: "Scallion", quantity: "1" });
  });

  it("requires exact units even when ingredient names are aliases", () => {
    const [line] = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Scallion", quantity: "2", unit: "bunches" }])],
      [pantryItem("pantry-onion", "Green onion", "1", "bunch")],
      new Set(),
    );

    expect(line).toMatchObject({ name: "Scallion", quantity: "2", unit: "bunches" });
  });

  it("aggregates singular and plural aliases", () => {
    const [line] = calculateGroceryLines(
      [
        recipe("recipe-a", [{ name: "Scallion", quantity: "1", unit: "bunch" }]),
        recipe("recipe-b", [{ name: "green onions", quantity: "2", unit: "bunch" }]),
      ],
      [],
      new Set(),
    );

    expect(line).toMatchObject({
      quantity: "3",
      recipeIds: ["recipe-a", "recipe-b"],
    });
  });

  it("keeps descriptive and hyphenated ingredient names distinct", () => {
    const lines = calculateGroceryLines(
      [recipe("recipe-a", [
        { name: "Scallion", quantity: "1", unit: null },
        { name: "fresh scallions", quantity: "2", unit: null },
        { name: "green-onion", quantity: "3", unit: null },
      ])],
      [],
      new Set(),
    );

    expect(lines.map(({ name, quantity }) => ({ name, quantity }))).toEqual([
      { name: "fresh scallions", quantity: "2" },
      { name: "Scallion", quantity: "1" },
      { name: "green-onion", quantity: "3" },
    ]);
  });

  it("keeps every unresolved occurrence separate and never subtracts pantry stock", () => {
    const lines = calculateGroceryLines(
      [
        recipe("recipe-a", [{ name: "Salt", quantity: "to taste", unit: null }]),
        recipe("recipe-b", [{ name: " salt ", quantity: "one pinch", unit: null }]),
      ],
      [pantryItem("pantry-salt", "Salt", "20", null)],
      new Set(),
    );

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => [line.quantity, line.recipeIds])).toEqual([
      ["to taste", ["recipe-a"]],
      ["one pinch", ["recipe-b"]],
    ]);
    expect(lines.every((line) => line.calculation === "unresolved")).toBe(true);
  });

  it("keeps numeric and unresolved requirements for one ingredient separate", () => {
    const lines = calculateGroceryLines(
      [recipe("recipe-a", [
        { name: "Salt", quantity: "2", unit: "tsp" },
        { name: "Salt", quantity: "to taste", unit: "tsp" },
      ])],
      [pantryItem("pantry-salt", "Salt", "1", "tsp")],
      new Set(),
    );

    expect(lines.map((line) => [line.calculation, line.quantity])).toEqual([
      ["computed", "1"],
      ["unresolved", "to taste"],
    ]);
  });
});

describe("calculateGroceryLines pinned pantry sources", () => {
  it("merges a compatible pinned pantry item into a computed shortage", () => {
    const [line] = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Flour", quantity: "2", unit: "cup" }])],
      [pantryItem("pantry-flour", "Flour", "1", "cup")],
      new Set(["pantry-flour"]),
    );

    expect(line).toMatchObject({
      quantity: "1",
      pantryItemId: "pantry-flour",
      calculation: "computed",
    });
  });

  it("creates a blank manual line with a trimmed unit when no computed line matches", () => {
    const [line] = calculateGroceryLines(
      [],
      [pantryItem("pantry-oil", " Olive   Oil ", "1/2", " bottle ")],
      new Set(["pantry-oil"]),
    );

    expect(line).toEqual({
      id: expect.any(String),
      name: "Olive Oil",
      quantity: "",
      unit: "bottle",
      recipeIds: [],
      pantryItemId: "pantry-oil",
      calculation: "manual",
    });
  });

  it("keeps a pinned item manual when pantry stock fully covers the recipe", () => {
    const [line] = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Flour", quantity: "1", unit: "cup" }])],
      [pantryItem("pantry-flour", "Flour", "1", "cup")],
      new Set(["pantry-flour"]),
    );

    expect(line).toMatchObject({
      quantity: "",
      recipeIds: [],
      pantryItemId: "pantry-flour",
      calculation: "manual",
    });
  });

  it("keeps a pinned item separate when it aligns only with an unresolved requirement", () => {
    const lines = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Salt", quantity: "to taste", unit: "tsp" }])],
      [pantryItem("pantry-salt", "Salt", "1", "tsp")],
      new Set(["pantry-salt"]),
    );

    expect(lines.map((line) => line.calculation)).toEqual(["unresolved", "manual"]);
    expect(lines[0]).toMatchObject({ quantity: "to taste" });
    expect(lines[0]).not.toHaveProperty("pantryItemId");
    expect(lines[1]).toMatchObject({ quantity: "", pantryItemId: "pantry-salt" });
  });

  it("keeps an incompatible pinned pantry item as a separate manual line", () => {
    const lines = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Milk", quantity: "2", unit: "cup" }])],
      [pantryItem("pantry-milk", "Milk", "1", "carton")],
      new Set(["pantry-milk"]),
    );

    expect(lines.map((line) => [line.calculation, line.unit])).toEqual([
      ["manual", "carton"],
      ["computed", "cup"],
    ]);
  });
});

describe("calculateGroceryLines stability", () => {
  it("returns deterministic IDs and user-friendly ordering", () => {
    const recipes = [
      recipe("recipe-b", [{ name: "Zucchini", quantity: "1", unit: null }]),
      recipe("recipe-a", [
        { name: "Apple", quantity: "to taste", unit: null },
        { name: "apple", quantity: "2", unit: null },
        { name: "Beans", quantity: "1", unit: "can" },
      ]),
    ];
    const pantry = [pantryItem("pantry-carrot", "Carrot", null, "bag")];
    const selected = new Set(["pantry-carrot"]);

    const first = calculateGroceryLines(recipes, pantry, selected);
    const second = calculateGroceryLines(recipes, pantry, selected);

    expect(second).toEqual(first);
    expect(new Set(first.map((line) => line.id)).size).toBe(first.length);
    expect(first.map((line) => [line.name, line.calculation])).toEqual([
      ["apple", "computed"],
      ["Apple", "unresolved"],
      ["Beans", "computed"],
      ["Carrot", "manual"],
      ["Zucchini", "computed"],
    ]);
  });

  it("uses stable computed IDs regardless of recipe input order", () => {
    const firstRecipe = recipe("recipe-a", [
      { name: "Flour", quantity: "1", unit: "cup" },
    ]);
    const secondRecipe = recipe("recipe-b", [
      { name: " flour ", quantity: "1/2", unit: " CUP " },
    ]);

    const forward = calculateGroceryLines(
      [firstRecipe, secondRecipe],
      [],
      new Set(),
    );
    const reversed = calculateGroceryLines(
      [secondRecipe, firstRecipe],
      [],
      new Set(),
    );

    expect(reversed).toEqual(forward);
  });
});
