import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findList: vi.fn(),
  updateList: vi.fn(),
  findSavedList: vi.fn(),
  deleteRecipes: vi.fn(),
  deleteItems: vi.fn(),
  createItems: vi.fn(),
  countPantryItems: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import {
  NamedGroceryListNotFoundError,
  NamedGroceryListReferenceError,
  saveGroceryList,
} from "@/services/named-grocery-list-service";

const id = "cm42345678901234567890123";
const pantryItemId = "cm22345678901234567890123";
const input = {
  importedWeeklyPlanId: null,
  recipes: [],
  items: [{
    lineKey: "custom:abc",
    name: "Apples",
    baseQuantity: "2",
    baseUnit: "bags",
    quantityOverride: null,
    unitOverride: null,
    checked: false,
    dismissed: false,
    pantryItemId: null,
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (operation) => operation({
    groceryList: {
      findFirst: mocks.findList,
      update: mocks.updateList,
      findUniqueOrThrow: mocks.findSavedList,
    },
    groceryListRecipe: { deleteMany: mocks.deleteRecipes },
    groceryItem: { deleteMany: mocks.deleteItems, createMany: mocks.createItems },
    pantryItem: { count: mocks.countPantryItems },
  }));
});

describe("saveGroceryList", () => {
  it("replaces a user's list and saves manual items", async () => {
    mocks.findList.mockResolvedValue({ id });
    mocks.findSavedList.mockResolvedValue({ id, name: "Weekly", ...input });

    await expect(saveGroceryList("user-1", id, input)).resolves.toMatchObject({
      id,
      name: "Weekly",
    });
    expect(mocks.findList).toHaveBeenCalledWith({
      where: { userId: "user-1", id },
      select: { id: true },
    });
    expect(mocks.createItems).toHaveBeenCalledWith({
      data: [{ groceryListId: id, ...input.items[0] }],
    });
  });

  it("does not modify another user's list", async () => {
    mocks.findList.mockResolvedValue(null);
    await expect(saveGroceryList("user-1", id, input)).rejects.toBeInstanceOf(
      NamedGroceryListNotFoundError,
    );
    expect(mocks.updateList).not.toHaveBeenCalled();
    expect(mocks.deleteItems).not.toHaveBeenCalled();
  });

  it("rejects a pantry item that belongs to another user", async () => {
    mocks.findList.mockResolvedValue({ id });
    mocks.countPantryItems.mockResolvedValue(0);
    await expect(saveGroceryList("user-1", id, {
      ...input,
      items: [{ ...input.items[0], pantryItemId }],
    })).rejects.toBeInstanceOf(NamedGroceryListReferenceError);
    expect(mocks.deleteItems).not.toHaveBeenCalled();
  });
});
