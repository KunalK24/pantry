import { describe, expect, it } from "vitest";

import { remapSavedLineStates } from "@/components/GroceryList";

const oldLineId = 'computed:["onion","cup"]';
const newLineId = 'computed:["onion","ml"]';

const savedItem = {
  lineKey: oldLineId,
  name: "onion",
  baseQuantity: "1",
  baseUnit: "cup",
  quantityOverride: "2",
  unitOverride: null,
  checked: true,
  dismissed: false,
  pantryItemId: null,
};

const savedState = {
  baseQuantity: "1",
  baseUnit: "cup",
  quantity: "2",
  unit: "cup",
  checked: true,
  dismissed: false,
};

describe("saved grocery line state remapping", () => {
  it("keeps a unique onion line's checked state and quantity override when normalization changes its ID and display name", () => {
    const lines = [{
      id: newLineId,
      name: "onion, chopped",
      quantity: "1",
      unit: "cup",
      recipeIds: ["recipe-1"],
      calculation: "computed" as const,
    }];

    expect(remapSavedLineStates(lines, [savedItem], { [oldLineId]: savedState })[newLineId])
      .toEqual(savedState);
  });

  it("does not copy state when multiple new lines could match one saved line", () => {
    const lines = [
      {
        id: newLineId,
        name: "onion, chopped",
        quantity: "1",
        unit: "cup",
        recipeIds: ["recipe-1"],
        calculation: "computed" as const,
      },
      {
        id: 'computed:["onion","alternate-ml"]',
        name: "onion, diced",
        quantity: "1",
        unit: "cup",
        recipeIds: ["recipe-2"],
        calculation: "computed" as const,
      },
    ];

    const remapped = remapSavedLineStates(lines, [savedItem], { [oldLineId]: savedState });
    expect(remapped[newLineId]).toBeUndefined();
    expect(remapped[lines[1].id]).toBeUndefined();
  });
});
