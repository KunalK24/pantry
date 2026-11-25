import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { NamedGroceryListSaveInput } from "@/schemas/grocery-list";

const listSelect = {
  id: true,
  name: true,
  revision: true,
  importedWeeklyPlanId: true,
  updatedAt: true,
  recipes: {
    orderBy: [{ source: "asc" }, { recipeId: "asc" }, { id: "asc" }],
    select: { recipeId: true, source: true },
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
} satisfies Prisma.GroceryListSelect;

export class NamedGroceryListNotFoundError extends Error {
  constructor() {
    super("Grocery list not found");
  }
}

export class NamedGroceryListReferenceError extends Error {
  constructor() {
    super("Grocery list references an unknown record");
  }
}

export class NamedGroceryListRevisionConflictError extends Error {
  constructor() {
    super("Grocery list changed since it was loaded");
    this.name = "NamedGroceryListRevisionConflictError";
  }
}

export async function listGroceryLists(userId: string) {
  const lists = await prisma.groceryList.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      updatedAt: true,
      _count: { select: { items: true } },
    },
  });

  return lists.map(({ _count, ...list }) => ({
    ...list,
    itemCount: _count.items,
  }));
}

export async function createGroceryList(userId: string, name: string) {
  return prisma.groceryList.create({
    data: { userId, key: `list:${randomUUID()}`, name },
    select: listSelect,
  });
}

export async function getGroceryList(userId: string, id: string) {
  return prisma.groceryList.findFirst({
    where: { userId, id },
    select: listSelect,
  });
}

export async function renameGroceryList(userId: string, id: string, name: string, expectedRevision: number) {
  const changed = await prisma.groceryList.updateMany({
    where: { userId, id, revision: expectedRevision },
    data: { name, revision: { increment: 1 } },
  });

  if (changed.count === 0) {
    const exists = await prisma.groceryList.findFirst({ where: { userId, id }, select: { id: true } });
    if (!exists) {
      throw new NamedGroceryListNotFoundError();
    }
    throw new NamedGroceryListRevisionConflictError();
  }

  return prisma.groceryList.findUniqueOrThrow({ where: { id }, select: listSelect });
}

export async function deleteGroceryList(userId: string, id: string) {
  const deleted = await prisma.groceryList.deleteMany({ where: { userId, id } });

  if (deleted.count === 0) {
    throw new NamedGroceryListNotFoundError();
  }
}

export async function saveGroceryList(
  userId: string,
  id: string,
  input: NamedGroceryListSaveInput,
) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const list = await transaction.groceryList.findFirst({
        where: { userId, id },
        select: { id: true },
      });

      if (!list) {
        throw new NamedGroceryListNotFoundError();
      }

      const recipeIds = [...new Set(input.recipes.map(({ recipeId }) => recipeId))];
      const pantryItemIds = [
        ...new Set(input.items.flatMap(({ pantryItemId }) => pantryItemId ? [pantryItemId] : [])),
      ];

      if (recipeIds.length > 0) {
        const count = await transaction.recipe.count({
          where: { userId, id: { in: recipeIds } },
        });
        if (count !== recipeIds.length) {
          throw new NamedGroceryListReferenceError();
        }
      }

      if (pantryItemIds.length > 0) {
        const count = await transaction.pantryItem.count({
          where: { userId, id: { in: pantryItemIds } },
        });
        if (count !== pantryItemIds.length) {
          throw new NamedGroceryListReferenceError();
        }
      }

      if (input.importedWeeklyPlanId) {
        const count = await transaction.weeklyPlan.count({
          where: { userId, id: input.importedWeeklyPlanId },
        });
        if (count !== 1) {
          throw new NamedGroceryListReferenceError();
        }
      }

      const changed = await transaction.groceryList.updateMany({
        where: { id, userId, revision: input.expectedRevision },
        data: { importedWeeklyPlanId: input.importedWeeklyPlanId, revision: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new NamedGroceryListRevisionConflictError();
      }
      await transaction.groceryListRecipe.deleteMany({ where: { groceryListId: id } });
      await transaction.groceryItem.deleteMany({ where: { groceryListId: id } });

      if (input.recipes.length > 0) {
        await transaction.groceryListRecipe.createMany({
          data: input.recipes.map((recipe) => ({ groceryListId: id, ...recipe })),
        });
      }
      if (input.items.length > 0) {
        await transaction.groceryItem.createMany({
          data: input.items.map((item) => ({ groceryListId: id, ...item })),
        });
      }

      return transaction.groceryList.findUniqueOrThrow({ where: { id }, select: listSelect });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new NamedGroceryListReferenceError();
    }
    throw error;
  }
}
