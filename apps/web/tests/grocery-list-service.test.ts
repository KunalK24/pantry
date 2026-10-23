import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const {
  findGroceryListMock,
  deleteGroceryListMock,
  transactionMock,
  countRecipesMock,
  countPantryItemsMock,
  countWeeklyPlansMock,
  upsertGroceryListMock,
  deleteListRecipesMock,
  createListRecipesMock,
  deleteGroceryItemsMock,
  createGroceryItemsMock,
  findSavedGroceryListMock,
} = vi.hoisted(() => ({
  findGroceryListMock: vi.fn(),
  deleteGroceryListMock: vi.fn(),
  transactionMock: vi.fn(),
  countRecipesMock: vi.fn(),
  countPantryItemsMock: vi.fn(),
  countWeeklyPlansMock: vi.fn(),
  upsertGroceryListMock: vi.fn(),
  deleteListRecipesMock: vi.fn(),
  createListRecipesMock: vi.fn(),
  deleteGroceryItemsMock: vi.fn(),
  createGroceryItemsMock: vi.fn(),
  findSavedGroceryListMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    groceryList: {
      findUnique: findGroceryListMock,
      deleteMany: deleteGroceryListMock,
    },
    $transaction: transactionMock,
  },
}));

import {
  clearActiveGroceryList,
  getActiveGroceryList,
  GroceryListReferenceError,
  saveActiveGroceryList,
} from "@/services/grocery-list-service";

const recipeId = "cm12345678901234567890123";
const pantryItemId = "cm22345678901234567890123";
const weeklyPlanId = "cm32345678901234567890123";
const groceryListId = "cm42345678901234567890123";
const userId = "cm52345678901234567890123";
const updatedAt = new Date("2026-10-01T12:00:00.000Z");

const groceryListSelect = {
  id: true,
  importedWeeklyPlanId: true,
  updatedAt: true,
  recipes: {
    orderBy: [{ source: "asc" }, { recipeId: "asc" }, { id: "asc" }],
    select: {
      recipeId: true,
      source: true,
    },
  },
  items: {
    orderBy: { lineKey: "asc" },
    select: {
      lineKey: true,
      name: true,
      baseQuantity: true,
      baseUnit: true,
      quantityOverride: true,
      unitOverride: true,
      checked: true,
      dismissed: true,
      pantryItemId: true,
    },
  },
};

const input = {
  importedWeeklyPlanId: weeklyPlanId,
  recipes: [
    { recipeId, source: "MANUAL" as const },
    { recipeId, source: "WEEKLY_PLAN" as const },
    { recipeId, source: "WEEKLY_PLAN" as const },
  ],
  items: [
    {
      lineKey: 'computed:["egg",""]',
      name: "Egg",
      baseQuantity: "5",
      baseUnit: "",
      quantityOverride: "6",
      unitOverride: null,
      checked: false,
      dismissed: false,
      pantryItemId,
    },
  ],
};

const persistedList = {
  id: groceryListId,
  importedWeeklyPlanId: weeklyPlanId,
  updatedAt,
  recipes: input.recipes,
  items: input.items,
};

beforeEach(() => {
  vi.clearAllMocks();
  transactionMock.mockImplementation(async (operation) =>
    operation({
      recipe: { count: countRecipesMock },
      pantryItem: { count: countPantryItemsMock },
      weeklyPlan: { count: countWeeklyPlansMock },
      groceryList: {
        upsert: upsertGroceryListMock,
        findUniqueOrThrow: findSavedGroceryListMock,
      },
      groceryListRecipe: {
        deleteMany: deleteListRecipesMock,
        createMany: createListRecipesMock,
      },
      groceryItem: {
        deleteMany: deleteGroceryItemsMock,
        createMany: createGroceryItemsMock,
      },
    }),
  );
});

describe("getActiveGroceryList", () => {
  it("returns the singleton snapshot in deterministic order", async () => {
    findGroceryListMock.mockResolvedValue(persistedList);

    await expect(getActiveGroceryList(userId)).resolves.toEqual(persistedList);
    expect(findGroceryListMock).toHaveBeenCalledWith({
      where: {
        userId_key: {
          userId,
          key: "active",
        },
      },
      select: groceryListSelect,
    });
  });

  it("returns null when the active list has not been saved", async () => {
    findGroceryListMock.mockResolvedValue(null);
    await expect(getActiveGroceryList(userId)).resolves.toBeNull();
  });
});

describe("saveActiveGroceryList", () => {
  it("atomically replaces the snapshot while preserving duplicate recipe occurrences", async () => {
    countRecipesMock.mockResolvedValue(1);
    countPantryItemsMock.mockResolvedValue(1);
    countWeeklyPlansMock.mockResolvedValue(1);
    upsertGroceryListMock.mockResolvedValue({ id: groceryListId });
    findSavedGroceryListMock.mockResolvedValue(persistedList);

    await expect(saveActiveGroceryList(userId, input)).resolves.toEqual(
      persistedList,
    );

    expect(countRecipesMock).toHaveBeenCalledWith({
      where: { userId, id: { in: [recipeId] } },
    });
    expect(countPantryItemsMock).toHaveBeenCalledWith({
      where: { userId, id: { in: [pantryItemId] } },
    });
    expect(countWeeklyPlansMock).toHaveBeenCalledWith({
      where: { userId, id: weeklyPlanId },
    });
    expect(upsertGroceryListMock).toHaveBeenCalledWith({
      where: {
        userId_key: {
          userId,
          key: "active",
        },
      },
      create: { userId, key: "active", importedWeeklyPlanId: weeklyPlanId },
      update: { importedWeeklyPlanId: weeklyPlanId },
      select: { id: true },
    });
    expect(deleteListRecipesMock).toHaveBeenCalledWith({
      where: { groceryListId },
    });
    expect(deleteGroceryItemsMock).toHaveBeenCalledWith({
      where: { groceryListId },
    });
    expect(createListRecipesMock).toHaveBeenCalledWith({
      data: input.recipes.map((recipe) => ({ groceryListId, ...recipe })),
    });
    expect(createGroceryItemsMock).toHaveBeenCalledWith({
      data: input.items.map((item) => ({ groceryListId, ...item })),
    });
    expect(findSavedGroceryListMock).toHaveBeenCalledWith({
      where: { id: groceryListId },
      select: groceryListSelect,
    });
  });

  it("saves an empty snapshot without reference or create queries", async () => {
    upsertGroceryListMock.mockResolvedValue({ id: groceryListId });
    findSavedGroceryListMock.mockResolvedValue({
      ...persistedList,
      importedWeeklyPlanId: null,
      recipes: [],
      items: [],
    });

    await saveActiveGroceryList(userId, {
      importedWeeklyPlanId: null,
      recipes: [],
      items: [],
    });

    expect(countRecipesMock).not.toHaveBeenCalled();
    expect(countPantryItemsMock).not.toHaveBeenCalled();
    expect(countWeeklyPlansMock).not.toHaveBeenCalled();
    expect(createListRecipesMock).not.toHaveBeenCalled();
    expect(createGroceryItemsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["recipe", { recipes: 0, pantry: 1, plan: 1 }],
    ["pantry item", { recipes: 1, pantry: 0, plan: 1 }],
    ["weekly plan", { recipes: 1, pantry: 1, plan: 0 }],
  ])(
    "rejects an unknown %s before replacing the snapshot",
    async (_case, counts) => {
      countRecipesMock.mockResolvedValue(counts.recipes);
      countPantryItemsMock.mockResolvedValue(counts.pantry);
      countWeeklyPlansMock.mockResolvedValue(counts.plan);

      await expect(saveActiveGroceryList(userId, input)).rejects.toBeInstanceOf(
        GroceryListReferenceError,
      );
      expect(upsertGroceryListMock).not.toHaveBeenCalled();
    },
  );

  it("translates a foreign-key race to a safe reference error", async () => {
    countRecipesMock.mockResolvedValue(1);
    countPantryItemsMock.mockResolvedValue(1);
    countWeeklyPlansMock.mockResolvedValue(1);
    upsertGroceryListMock.mockResolvedValue({ id: groceryListId });
    deleteListRecipesMock.mockResolvedValue({ count: 0 });
    deleteGroceryItemsMock.mockResolvedValue({ count: 0 });
    createListRecipesMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Foreign key failed", {
        code: "P2003",
        clientVersion: "7.10.0",
      }),
    );

    await expect(saveActiveGroceryList(userId, input)).rejects.toBeInstanceOf(
      GroceryListReferenceError,
    );
  });
});

describe("clearActiveGroceryList", () => {
  it("idempotently deletes by the active singleton key", async () => {
    deleteGroceryListMock.mockResolvedValue({ count: 0 });

    await expect(clearActiveGroceryList(userId)).resolves.toBeUndefined();
    expect(deleteGroceryListMock).toHaveBeenCalledWith({
      where: { userId, key: "active" },
    });
  });
});
