import { describe, expect, it } from "vitest";

import {
  normalizeGroceryIngredientName,
  normalizeIngredientName,
  parseIngredientDetails,
  titleCaseIngredientName,
} from "@/lib/ingredient-normalization";

describe("parseIngredientDetails", () => {
  it("treats parenthetical use notes as qualifiers rather than ingredient identity", () => {
    expect(parseIngredientDetails("Neutral Oil (for Beef Marinade)").normalizedName).toBe("neutral oil");
    expect(parseIngredientDetails("Oyster Sauce (for Sauce)").normalizedName).toBe("oyster sauce");
  });

  it("extracts per-can weight while preserving count and canonical ingredient", () => {
    expect(parseIngredientDetails("15-ounce can Black beans", { quantity: "1" })).toEqual({
      normalizedName: "black beans",
      quantity: "1",
      unit: "can",
      brand: null,
      modifiers: [],
      packageQuantity: "15",
      packageUnit: "oz",
    });
    expect(parseIngredientDetails("2 cans of Black Beans")).toMatchObject({
      normalizedName: "black beans",
      quantity: "2",
      unit: "can",
      packageQuantity: null,
      packageUnit: null,
    });
    expect(parseIngredientDetails("Black beans", { quantity: "1 15-ounce can" })).toMatchObject({
      normalizedName: "black beans",
      quantity: "1",
      unit: "can",
      packageQuantity: "15",
      packageUnit: "oz",
    });
    expect(parseIngredientDetails("Black beans", { quantity: "1", unit: "15-ounce can" })).toMatchObject({
      normalizedName: "black beans",
      quantity: "1",
      unit: "can",
      packageQuantity: "15",
      packageUnit: "oz",
    });
  });

  it("parses parenthetical sizes and brand names", () => {
    expect(parseIngredientDetails("1 bag (500 g) lentils")).toMatchObject({
      normalizedName: "lentils",
      quantity: "1",
      unit: "bag",
      packageQuantity: "500",
      packageUnit: "g",
    });
    expect(parseIngredientDetails("2 × 400 g bags lentils")).toMatchObject({
      normalizedName: "lentils",
      quantity: "2",
      unit: "bag",
      packageQuantity: "400",
      packageUnit: "g",
    });
    expect(parseIngredientDetails("1 can (15 oz) Aldi garbanzo beans")).toMatchObject({
      normalizedName: "chickpea",
      brand: "Aldi",
      packageQuantity: "15",
      packageUnit: "oz",
    });
  });

  it("recognizes compact weights in a pantry name without treating them as a package", () => {
    expect(parseIngredientDetails("500g rice")).toMatchObject({
      normalizedName: "rice",
      quantity: "500",
      unit: "gram",
      packageQuantity: null,
      packageUnit: null,
    });
    expect(parseIngredientDetails("500g rice", { quantity: "500" })).toMatchObject({
      normalizedName: "rice",
      quantity: "500",
      unit: "gram",
    });
    expect(parseIngredientDetails("500g bag lentils")).toMatchObject({
      normalizedName: "lentils",
      quantity: null,
      unit: "bag",
      packageQuantity: "500",
      packageUnit: "g",
    });
  });

  it("keeps a packaged product form in the canonical name while separating preparation notes", () => {
    expect(parseIngredientDetails("crushed tomatoes (undrained)", {
      quantity: "1",
      unit: "can",
      packageQuantity: "14",
      packageUnit: "oz",
    })).toMatchObject({
      normalizedName: "crushed tomatoes",
      modifiers: ["undrained"],
      packageQuantity: "14",
      packageUnit: "oz",
    });
    expect(parseIngredientDetails("diced tomatoes", { quantity: "1", unit: "can" })).toMatchObject({
      normalizedName: "diced tomatoes",
      modifiers: [],
    });
    expect(parseIngredientDetails("diced tomatoes", { quantity: "1", unit: "lb" })).toMatchObject({
      normalizedName: "tomatoes",
      modifiers: ["diced"],
    });
  });

  it.each([
    ["Trader Joe's diced tomatoes", "tomatoes", "Trader Joe's", ["diced"]],
    ["Kroger garbanzo beans", "chickpea", "Kroger", []],
    ["green onions, thinly sliced", "green onion", null, ["thinly sliced"]],
    ["roughly chopped fresh parsley", "fresh parsley", null, ["roughly chopped"]],
    ["minced garlic", "garlic", null, ["minced"]],
  ])("separates brand and preparation in %j", (name, normalizedName, brand, modifiers) => {
    expect(parseIngredientDetails(name)).toMatchObject({ normalizedName, brand, modifiers });
  });

  it.each(["black beans", "dried beans", "boneless chicken breast", "canned tomatoes"])(
    "keeps identity terms in %j",
    (name) => {
      expect(parseIngredientDetails(name).normalizedName).toBe(name);
    },
  );

  it("lets explicit corrections override extraction, including clears", () => {
    expect(parseIngredientDetails("Kroger sliced garlic", {
      brand: null,
      modifiers: [],
      packageQuantity: null,
      packageUnit: null,
    })).toMatchObject({
      normalizedName: "garlic",
      brand: null,
      modifiers: [],
    });
  });

  it("extracts arbitrary brands when the wording marks them explicitly", () => {
    expect(parseIngredientDetails("brand: Acme Farms, chopped parsley")).toMatchObject({
      normalizedName: "parsley",
      brand: "Acme Farms",
      modifiers: ["chopped"],
    });
    expect(parseIngredientDetails("garbanzo beans, by Acme Farms")).toMatchObject({
      normalizedName: "chickpea",
      brand: "Acme Farms",
    });
    expect(parseIngredientDetails("Acme Farms garbanzo beans")).toMatchObject({
      normalizedName: "acme farms garbanzo beans",
      brand: null,
    });
    expect(parseIngredientDetails("Acme Farms garbanzo beans", { brand: "Acme Farms" })).toMatchObject({
      normalizedName: "chickpea",
      brand: "Acme Farms",
    });
  });
});

describe("titleCaseIngredientName", () => {
  it.each([
    ["olive oil", "Olive Oil"],
    ["OLIVE OIL", "Olive Oil"],
    ["extra-virgin olive oil", "Extra-Virgin Olive Oil"],
    ["jalapeño pepper", "Jalapeño Pepper"],
  ])("capitalizes each word in %j", (name, expected) => {
    expect(titleCaseIngredientName(name)).toBe(expected);
  });
});

describe("normalizeIngredientName", () => {
  it("normalizes casing and whitespace", () => {
    expect(normalizeIngredientName("  Olive\t  OIL\n")).toBe("olive oil");
  });

  it.each(["scallion", "Scallions", " green   onions "])(
    "maps %j to the canonical green onion name",
    (name) => {
      expect(normalizeIngredientName(name)).toBe("green onion");
    },
  );

  it("keeps the canonical name unchanged", () => {
    expect(normalizeIngredientName("Green Onion")).toBe("green onion");
  });

  it.each([
    ["constructor", "constructor"],
    ["toString", "tostring"],
    ["__proto__", "__proto__"],
    ["fresh scallions", "fresh scallions"],
    ["green-onion", "green-onion"],
    ["scallion, chopped", "scallion, chopped"],
    ["spring onion", "spring onion"],
    ["tomatoes", "tomatoes"],
  ])("does not infer a rule for %j", (name, expected) => {
    expect(normalizeIngredientName(name)).toBe(expected);
  });
});

describe("normalizeGroceryIngredientName", () => {
  it("strips recipe prep descriptors and appends grocery count units for display", () => {
    expect(
      normalizeGroceryIngredientName("garlic, thinly sliced", "cloves"),
    ).toEqual({
      normalizedName: "garlic",
      displayName: "garlic cloves",
    });
  });

  it.each([
    ["guanciale, cut into 1/8 inch (3mm) cubes", "guanciale"],
    ["red Fresno chillies, finely chopped", "red fresno chillies"],
    ["unsalted butter, cold and cubed", "unsalted butter"],
  ])(
    "strips structured prep instruction suffixes from %j",
    (name, expected) => {
      expect(normalizeGroceryIngredientName(name)).toEqual({
        normalizedName: expected,
        displayName: expected,
      });
    },
  );

  it("applies ingredient aliases after stripping prep descriptors", () => {
    expect(normalizeGroceryIngredientName("scallions, chopped")).toEqual({
      normalizedName: "green onion",
      displayName: "green onion",
    });
  });

  it.each([
    ["freshly cracked black pepper", "black pepper"],
    ["freshly grated Parmigiano Reggiano", "parmigiano reggiano"],
  ])("removes leading prep phrase from %j", (name, expected) => {
    expect(normalizeGroceryIngredientName(name)).toEqual({
      normalizedName: expected,
      displayName: expected,
    });
  });

  it("preserves meaningful descriptors that identify the grocery item", () => {
    expect(normalizeGroceryIngredientName("extra virgin olive oil")).toEqual({
      normalizedName: "extra virgin olive oil",
      displayName: "extra virgin olive oil",
    });
    expect(normalizeGroceryIngredientName("Red Onion")).toEqual({
      normalizedName: "red onion",
      displayName: "Red Onion",
    });
  });

  it.each(["chicken thighs, bone-in", "tomatoes, canned", "beans, low sodium"])(
    "preserves non-prep suffixes in %j",
    (name) => {
      expect(normalizeGroceryIngredientName(name)).toEqual({
        normalizedName: name.toLowerCase(),
        displayName: name,
      });
    },
  );

  it("does not append volume or weight units to the grocery display name", () => {
    expect(normalizeGroceryIngredientName("flour", "cup")).toEqual({
      normalizedName: "flour",
      displayName: "flour",
    });
    expect(normalizeGroceryIngredientName("gochujang", "Tbsp")).toEqual({
      normalizedName: "gochujang",
      displayName: "gochujang",
    });
  });

  it("does not strip spice names that end with a count-unit word", () => {
    expect(normalizeGroceryIngredientName("ground cloves", "tsp")).toEqual({
      normalizedName: "ground cloves",
      displayName: "ground cloves",
    });
    expect(normalizeGroceryIngredientName("whole cloves", "tsp")).toEqual({
      normalizedName: "whole cloves",
      displayName: "whole cloves",
    });
  });
});
