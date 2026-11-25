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
  renameList: vi.fn(),
  findOwnedList: vi.fn(),
  findRenamedList: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    groceryList: {
      updateMany: mocks.renameList,
      findFirst: mocks.findOwnedList,
      findUniqueOrThrow: mocks.findRenamedList,
    },
  },
}));

import {
  NamedGroceryListNotFoundError,
  NamedGroceryListReferenceError,
  NamedGroceryListRevisionConflictError,
  renameGroceryList,
  saveGroceryList,
} from "@/services/named-grocery-list-service";

const id = "cm42345678901234567890123";
const pantryItemId = "cm22345678901234567890123";
const input = {
  expectedRevision: 0,
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
      updateMany: mocks.updateList,
      findUniqueOrThrow: mocks.findSavedList,
    },
    groceryListRecipe: { deleteMany: mocks.deleteRecipes },
    groceryItem: { deleteMany: mocks.deleteItems, createMany: mocks.createItems },
    pantryItem: { count: mocks.countPantryItems },
  }));
});

describe("renameGroceryList", () => {
  it("increments the revision only when the loaded version still matches", async () => {
    mocks.renameList.mockResolvedValue({ count: 1 });
    mocks.findRenamedList.mockResolvedValue({ id, name: "Market", revision: 2 });
    await expect(renameGroceryList("user-1", id, "Market", 1))
      .resolves.toMatchObject({ name: "Market", revision: 2 });
    expect(mocks.renameList).toHaveBeenCalledWith({
      where: { userId: "user-1", id, revision: 1 },
      data: { name: "Market", revision: { increment: 1 } },
    });
  });

  it("reports a conflict when another client renamed the list", async () => {
    mocks.renameList.mockResolvedValue({ count: 0 });
    mocks.findOwnedList.mockResolvedValue({ id });
    await expect(renameGroceryList("user-1", id, "Market", 1))
      .rejects.toBeInstanceOf(NamedGroceryListRevisionConflictError);
  });
});

describe("saveGroceryList", () => {
  it("replaces a user's list and saves manual items", async () => {
    mocks.findList.mockResolvedValue({ id });
    mocks.updateList.mockResolvedValue({ count: 1 });
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
    expect(mocks.updateList).toHaveBeenCalledWith({
      where: { id, userId: "user-1", revision: 0 },
      data: { importedWeeklyPlanId: null, revision: { increment: 1 } },
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

  it("rejects stale edits without replacing list rows", async () => {
    mocks.findList.mockResolvedValue({ id });
    mocks.updateList.mockResolvedValue({ count: 0 });
    await expect(saveGroceryList("user-1", id, input))
      .rejects.toBeInstanceOf(NamedGroceryListRevisionConflictError);
    expect(mocks.deleteRecipes).not.toHaveBeenCalled();
    expect(mocks.deleteItems).not.toHaveBeenCalled();
  });
});
