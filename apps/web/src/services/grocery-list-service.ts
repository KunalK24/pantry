import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { type GroceryListInput } from "@/schemas/grocery-list";

const activeListKey = "active";

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
    orderBy: {
      lineKey: "asc",
    },
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

export class GroceryListReferenceError extends Error {
  constructor() {
    super("Grocery list references an unknown record");
    this.name = "GroceryListReferenceError";
  }
}

function isForeignKeyError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

export async function getActiveGroceryList(userId: string) {
  return prisma.groceryList.findUnique({
    where: {
      userId_key: {
        userId,
        key: activeListKey,
      },
    },
    select: groceryListSelect,
  });
}

export async function saveActiveGroceryList(
  userId: string,
  input: GroceryListInput,
) {
  const recipeIds = [...new Set(input.recipes.map(({ recipeId }) => recipeId))];
  const pantryItemIds = [
    ...new Set(
      input.items.flatMap(({ pantryItemId }) =>
        pantryItemId ? [pantryItemId] : [],
      ),
    ),
  ];

  try {
    return await prisma.$transaction(async (transaction) => {
      if (recipeIds.length > 0) {
        const recipeCount = await transaction.recipe.count({
          where: {
            userId,
            id: {
              in: recipeIds,
            },
          },
        });

        if (recipeCount !== recipeIds.length) {
          throw new GroceryListReferenceError();
        }
      }

      if (pantryItemIds.length > 0) {
        const pantryItemCount = await transaction.pantryItem.count({
          where: {
            userId,
            id: {
              in: pantryItemIds,
            },
          },
        });

        if (pantryItemCount !== pantryItemIds.length) {
          throw new GroceryListReferenceError();
        }
      }

      if (input.importedWeeklyPlanId) {
        const weeklyPlanCount = await transaction.weeklyPlan.count({
          where: {
            userId,
            id: input.importedWeeklyPlanId,
          },
        });

        if (weeklyPlanCount !== 1) {
          throw new GroceryListReferenceError();
        }
      }

      const list = await transaction.groceryList.upsert({
        where: {
          userId_key: {
            userId,
            key: activeListKey,
          },
        },
        create: {
          userId,
          key: activeListKey,
          importedWeeklyPlanId: input.importedWeeklyPlanId,
        },
        update: {
          importedWeeklyPlanId: input.importedWeeklyPlanId,
        },
        select: {
          id: true,
        },
      });

      await transaction.groceryListRecipe.deleteMany({
        where: {
          groceryListId: list.id,
        },
      });
      await transaction.groceryItem.deleteMany({
        where: {
          groceryListId: list.id,
        },
      });

      if (input.recipes.length > 0) {
        await transaction.groceryListRecipe.createMany({
          data: input.recipes.map((recipe) => ({
            groceryListId: list.id,
            ...recipe,
          })),
        });
      }

      if (input.items.length > 0) {
        await transaction.groceryItem.createMany({
          data: input.items.map((item) => ({
            groceryListId: list.id,
            ...item,
          })),
        });
      }

      return transaction.groceryList.findUniqueOrThrow({
        where: {
          id: list.id,
        },
        select: groceryListSelect,
      });
    });
  } catch (error) {
    if (isForeignKeyError(error)) {
      throw new GroceryListReferenceError();
    }

    throw error;
  }
}

export async function clearActiveGroceryList(userId: string) {
  await prisma.groceryList.deleteMany({
    where: {
      userId,
      key: activeListKey,
    },
  });
}
