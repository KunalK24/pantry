import { describe, expect, it } from "vitest";

import {
  normalizeGroceryIngredientName,
  normalizeIngredientName,
} from "@/lib/ingredient-normalization";

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
