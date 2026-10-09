import { describe, expect, it } from "vitest";

import {
  calculateGroceryLines,
  calculateRecipeAvailability,
  calculateRecipeRecommendations,
  normalizeGroceryText,
  type GroceryLineCalculation,
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

function groceryLine(
  id: string,
  name: string,
): GroceryLineCalculation {
  return {
    id,
    name,
    quantity: "1",
    unit: "",
    recipeIds: [],
    calculation: "manual",
  };
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

  it.each([
    ["integer", "2", 3, "1", "5"],
    ["decimal", "1.5", 2, "0.5", "2 1/2"],
    ["fraction", "3/4", 3, "1/4", "2"],
    ["mixed number", "1 1/2", 2, "1/2", "2 1/2"],
  ])(
    "multiplies a %s requirement before subtracting pantry stock",
    (_case, quantity, multiplier, pantryQuantity, expected) => {
      const [line] = calculateGroceryLines(
        [recipe("recipe-a", [{ name: "Flour", quantity, unit: "cup" }])],
        [pantryItem("pantry-flour", "Flour", pantryQuantity, "cup")],
        new Set(),
        new Map([["recipe-a", multiplier]]),
      );

      expect(line.quantity).toBe(expected);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "safely defaults invalid multiplier %s to one preparation",
    (multiplier) => {
      const [line] = calculateGroceryLines(
        [recipe("recipe-a", [{ name: "Egg", quantity: "2", unit: null }])],
        [pantryItem("pantry-egg", "Egg", "1", null)],
        new Set(),
        new Map([["recipe-a", multiplier]]),
      );

      expect(line.quantity).toBe("1");
    },
  );

  it("keeps one unresolved line and warns when a recipe is repeated", () => {
    const lines = calculateGroceryLines(
      [recipe("recipe-a", [{ name: "Salt", quantity: "to taste", unit: null }])],
      [pantryItem("pantry-salt", "Salt", "20", null)],
      new Set(),
      new Map([["recipe-a", 3]]),
    );

    expect(lines).toEqual([
      expect.objectContaining({
        name: "Salt",
        quantity: "to taste",
        recipeIds: ["recipe-a"],
        calculation: "unresolved",
        warning: "3 preparations require manual quantity verification.",
      }),
    ]);
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

  it("uses grocery-friendly display names for recipe prep descriptors", () => {
    const [line] = calculateGroceryLines(
      [
        recipe("recipe-a", [
          { name: "garlic, thinly sliced", quantity: "5", unit: "cloves" },
        ]),
      ],
      [],
      new Set(),
    );

    expect(line).toMatchObject({
      name: "garlic cloves",
      quantity: "5",
      unit: "cloves",
      calculation: "computed",
    });
  });

  it("uses grocery-friendly display names for unresolved recipe prep descriptors", () => {
    const [line] = calculateGroceryLines(
      [
        recipe("recipe-a", [
          { name: "freshly cracked black pepper", quantity: "to taste", unit: null },
        ]),
      ],
      [],
      new Set(),
    );

    expect(line).toMatchObject({
      name: "black pepper",
      quantity: "to taste",
      unit: "",
      calculation: "unresolved",
    });
  });

  it("aggregates recipe prep variants under the stripped ingredient name", () => {
    const [line] = calculateGroceryLines(
      [
        recipe("recipe-a", [
          { name: "garlic, minced", quantity: "2", unit: "cloves" },
        ]),
        recipe("recipe-b", [
          { name: "garlic, thinly sliced", quantity: "3", unit: "cloves" },
        ]),
      ],
      [],
      new Set(),
    );

    expect(line).toMatchObject({
      name: "garlic cloves",
      quantity: "5",
      unit: "cloves",
      recipeIds: ["recipe-a", "recipe-b"],
      calculation: "computed",
    });
  });

  it("subtracts pantry stock using the stripped ingredient name", () => {
    const [line] = calculateGroceryLines(
      [
        recipe("recipe-a", [
          { name: "garlic, thinly sliced", quantity: "5", unit: "cloves" },
        ]),
      ],
      [pantryItem("pantry-garlic", "garlic", "2", "cloves")],
      new Set(),
    );

    expect(line).toMatchObject({
      name: "garlic cloves",
      quantity: "3",
      unit: "cloves",
      calculation: "computed",
    });
  });

  it("subtracts pantry stock with grocery count units in the pantry name", () => {
    const [line] = calculateGroceryLines(
      [
        recipe("recipe-a", [
          { name: "garlic, thinly sliced", quantity: "5", unit: "cloves" },
        ]),
      ],
      [pantryItem("pantry-garlic", "garlic cloves", "2", "cloves")],
      new Set(),
    );

    expect(line).toMatchObject({
      name: "garlic cloves",
      quantity: "3",
      unit: "cloves",
      calculation: "computed",
    });
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

  it("merges a compatible pinned pantry item with grocery count units in its name", () => {
    const [line] = calculateGroceryLines(
      [
        recipe("recipe-a", [
          { name: "garlic, thinly sliced", quantity: "5", unit: "cloves" },
        ]),
      ],
      [pantryItem("pantry-garlic", "garlic cloves", "2", "cloves")],
      new Set(["pantry-garlic"]),
    );

    expect(line).toMatchObject({
      name: "garlic cloves",
      quantity: "3",
      unit: "cloves",
      pantryItemId: "pantry-garlic",
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

  it("keeps prep descriptors in manually selected pantry item names", () => {
    const [line] = calculateGroceryLines(
      [],
      [pantryItem("pantry-garlic", " garlic, thinly sliced ", "5", " cloves ")],
      new Set(["pantry-garlic"]),
    );

    expect(line).toEqual({
      id: expect.any(String),
      name: "garlic, thinly sliced",
      quantity: "",
      unit: "cloves",
      recipeIds: [],
      pantryItemId: "pantry-garlic",
      calculation: "manual",
    });
  });

  it("preserves pantry display names for manual pantry-only lines", () => {
    const [line] = calculateGroceryLines(
      [],
      [pantryItem("pantry-garlic", " garlic   cloves ", "2", " cloves ")],
      new Set(["pantry-garlic"]),
    );

    expect(line).toMatchObject({
      name: "garlic cloves",
      quantity: "",
      unit: "cloves",
      pantryItemId: "pantry-garlic",
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

describe("calculateRecipeAvailability", () => {
  it("distinguishes full, partial, missing, unresolved, and unit-mismatched coverage", () => {
    const candidate = recipe("availability", [
      { name: "Eggs", quantity: "2", unit: null },
      { name: "Milk", quantity: "1", unit: "cup" },
      { name: "Flour", quantity: "2", unit: "cup" },
      { name: "Salt", quantity: "to taste", unit: null },
      { name: "Pepper", quantity: "1", unit: "tsp" },
    ]);
    const pantry = [
      pantryItem("eggs", " eggs ", "2", null),
      pantryItem("milk", "MILK", "1/2", "cup"),
      pantryItem("flour", "Flour", "2", "tbsp"),
      pantryItem("salt", "Salt", "10", null),
    ];

    expect(calculateRecipeAvailability(candidate, pantry)).toEqual({
      available: 1,
      total: 5,
      availableNames: ["Eggs"],
    });
    expect(calculateRecipeAvailability(candidate, [])).toEqual({
      available: 0,
      total: 5,
      availableNames: [],
    });
  });

  it("aggregates duplicate requirements and pantry records by alias and exact unit", () => {
    const candidate = recipe("aliases", [
      { name: "Scallion", quantity: "1", unit: "bunch" },
      { name: " green onions ", quantity: "2", unit: "BUNCH" },
      { name: "Scallions", quantity: "1", unit: "cup" },
    ]);
    const almostEnough = [
      pantryItem("onion-a", "Green Onion", "1", "bunch"),
      pantryItem("onion-b", "scallions", "1 1/2", " BUNCH "),
      pantryItem("onion-c", "green onions", "1", "cup"),
    ];

    expect(calculateRecipeAvailability(candidate, almostEnough)).toEqual({
      available: 0,
      total: 1,
      availableNames: [],
    });

    expect(
      calculateRecipeAvailability(candidate, [
        ...almostEnough,
        pantryItem("onion-d", "Scallion", "1/2", "bunch"),
      ]),
    ).toEqual({
      available: 1,
      total: 1,
      availableNames: ["Scallion"],
    });
  });

  it("makes a normalized name unavailable when any duplicate requirement is unresolved", () => {
    const candidate = recipe("mixed", [
      { name: "Salt", quantity: "1", unit: "tsp" },
      { name: " salt ", quantity: null, unit: "tsp" },
    ]);

    expect(
      calculateRecipeAvailability(candidate, [
        pantryItem("salt", "Salt", "20", "tsp"),
      ]),
    ).toEqual({ available: 0, total: 1, availableNames: [] });
  });

  it("matches recipe prep descriptors against pantry stock", () => {
    const candidate = recipe("prep", [
      { name: "garlic, thinly sliced", quantity: "5", unit: "cloves" },
    ]);

    expect(
      calculateRecipeAvailability(candidate, [
        pantryItem("garlic", "garlic", "5", "cloves"),
      ]),
    ).toEqual({
      available: 1,
      total: 1,
      availableNames: ["garlic cloves"],
    });
  });

  it("matches pantry stock with grocery count units in the pantry name", () => {
    const candidate = recipe("prep", [
      { name: "garlic, thinly sliced", quantity: "5", unit: "cloves" },
    ]);

    expect(
      calculateRecipeAvailability(candidate, [
        pantryItem("garlic", "garlic cloves", "5", "cloves"),
      ]),
    ).toEqual({
      available: 1,
      total: 1,
      availableNames: ["garlic cloves"],
    });
  });
});

describe("calculateRecipeRecommendations", () => {
  it("ranks pantry-only matches by fewest missing ingredients, then coverage ratio", () => {
    const recipes = [
      recipe("wide", [
        { name: "Egg", quantity: "1", unit: null },
        { name: "Cheese", quantity: "1", unit: null },
        { name: "Bacon", quantity: "1", unit: null },
        { name: "Potato", quantity: "1", unit: null },
      ]),
      recipe("focused", [
        { name: "Egg", quantity: "1", unit: null },
        { name: "Toast", quantity: "1", unit: null },
      ]),
      recipe("best-ratio", [
        { name: "Egg", quantity: "1", unit: null },
        { name: "Cheese", quantity: "1", unit: null },
        { name: "Toast", quantity: "1", unit: null },
      ]),
    ];
    const pantry = [
      pantryItem("egg", "Egg", "1", null),
      pantryItem("cheese", "Cheese", "1", null),
    ];

    const recommendations = calculateRecipeRecommendations(
      recipes,
      pantry,
      [],
      new Set(),
    );

    expect(recommendations.map(({ recipe: item }) => item.id)).toEqual([
      "best-ratio",
      "focused",
      "wide",
    ]);
    expect(recommendations[0]).toMatchObject({
      pantryCoveredNames: ["Cheese", "Egg"],
      groceryOverlapNames: [],
      missingNames: ["Toast"],
      total: 3,
    });
  });

  it("uses visible grocery names without requiring selected recipes or matching units", () => {
    const recipes = [
      recipe("fewer-missing", [
        { name: "Tortilla", quantity: "4", unit: "large" },
        { name: "Cheese", quantity: "2", unit: "cups" },
        { name: "Salsa", quantity: "1", unit: "jar" },
      ]),
      recipe("more-overlap", [
        { name: "Egg", quantity: "2", unit: null },
        { name: "Tortilla", quantity: "2", unit: "small" },
        { name: "Bacon", quantity: "1", unit: "pack" },
        { name: "Potato", quantity: "2", unit: null },
        { name: "Onion", quantity: "1", unit: null },
      ]),
    ];

    const recommendations = calculateRecipeRecommendations(
      recipes,
      [],
      [groceryLine("egg", "EGG"), groceryLine("tortilla", " tortilla ")],
      new Set(),
    );

    expect(recommendations.map(({ recipe: item }) => item.id)).toEqual([
      "fewer-missing",
      "more-overlap",
    ]);
    expect(recommendations[0].groceryOverlapNames).toEqual(["Tortilla"]);
    expect(recommendations[1].groceryOverlapNames).toEqual([
      "Egg",
      "Tortilla",
    ]);
  });

  it("classifies pantry coverage before duplicate grocery overlap", () => {
    const [recommendation] = calculateRecipeRecommendations(
      [recipe("combined", [
        { name: "Scallions", quantity: "2", unit: "bunch" },
        { name: "Rice", quantity: "1", unit: "cup" },
        { name: "Lime", quantity: "1", unit: null },
      ])],
      [pantryItem("onion", "Green onion", "2", "bunch")],
      [
        groceryLine("onion-line", "Scallion"),
        groceryLine("rice-line", "RICE"),
      ],
      new Set(),
    );

    expect(recommendation).toMatchObject({
      pantryCoveredNames: ["Scallions"],
      groceryOverlapNames: ["Rice"],
      missingNames: ["Lime"],
      total: 3,
    });
  });

  it("matches grocery-friendly display names to recipe prep descriptors", () => {
    const [recommendation] = calculateRecipeRecommendations(
      [
        recipe("prep", [
          { name: "garlic, thinly sliced", quantity: "5", unit: "cloves" },
          { name: "Pasta", quantity: "1", unit: "lb" },
        ]),
      ],
      [],
      [
        {
          ...groceryLine("garlic-line", "garlic cloves"),
          unit: "cloves",
        },
      ],
      new Set(),
    );

    expect(recommendation).toMatchObject({
      groceryOverlapNames: ["garlic cloves"],
      missingNames: ["Pasta"],
      total: 2,
    });
  });

  it("excludes selected and zero-match recipes while returning every match", () => {
    const recommendations = calculateRecipeRecommendations(
      [
        recipe("selected", [{ name: "Egg", quantity: "1", unit: null }]),
        recipe("match-a", [{ name: "Egg", quantity: "2", unit: null }]),
        recipe("match-b", [{ name: "Egg", quantity: "3", unit: null }]),
        recipe("no-match", [{ name: "Flour", quantity: "1", unit: "cup" }]),
      ],
      [],
      [groceryLine("egg", "Egg")],
      new Set(["selected"]),
    );

    expect(recommendations.map(({ recipe: item }) => item.id)).toEqual([
      "match-a",
      "match-b",
    ]);
  });

  it("applies grocery, recipe-name, and recipe-id tie breakers deterministically", () => {
    const recommendations = calculateRecipeRecommendations(
      [
        { ...recipe("id-b", [
          { name: "Egg", quantity: "1", unit: null },
          { name: "Salt", quantity: "1", unit: null },
        ]), name: "Same" },
        { ...recipe("pantry", [
          { name: "Egg", quantity: "1", unit: null },
          { name: "Salt", quantity: "1", unit: null },
        ]), name: "A pantry match" },
        { ...recipe("id-a", [
          { name: "Egg", quantity: "1", unit: null },
          { name: "Salt", quantity: "1", unit: null },
        ]), name: "Same" },
        { ...recipe("named", [
          { name: "Egg", quantity: "2", unit: null },
          { name: "Salt", quantity: "1", unit: null },
        ]), name: "Before Same" },
      ],
      [pantryItem("egg", "Egg", "1", null)],
      [groceryLine("salt", "Salt"), groceryLine("egg", "Egg")],
      new Set(),
    );

    expect(recommendations.map(({ recipe: item }) => item.id)).toEqual([
      "named",
      "pantry",
      "id-a",
      "id-b",
    ]);
    expect(recommendations[0]).toMatchObject({
      pantryCoveredNames: [],
      groceryOverlapNames: ["Egg", "Salt"],
    });
  });

  it("returns no recommendations when pantry and visible lines have no overlap", () => {
    expect(
      calculateRecipeRecommendations(
        [recipe("bread", [{ name: "Flour", quantity: "2", unit: "cup" }])],
        [pantryItem("egg", "Egg", "12", null)],
        [groceryLine("milk", "Milk")],
        new Set(),
      ),
    ).toEqual([]);
  });
});
