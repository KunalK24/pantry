import "dotenv/config";

import { pathToFileURL } from "node:url";

import { parseIngredientDetails } from "@/lib/ingredient-normalization";

const BACKFILL_TRANSACTION_TIMEOUT_MS = 120_000;

type IngredientRow = { id: string; name: string; normalizedName: string };
type RecipeIngredientRow = {
  recipeId: string;
  ingredientId: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  brand: string | null;
  modifiers: string[];
  packageQuantity: string | null;
  packageUnit: string | null;
};
type PantryItemRow = {
  id: string;
  name: string;
  normalizedName: string;
  quantity: string | null;
  unit: string | null;
  brand: string | null;
  modifiers: string[];
  packageQuantity: string | null;
  packageUnit: string | null;
};

export function planIngredientDetailsBackfill(
  ingredients: IngredientRow[],
  recipeIngredients: RecipeIngredientRow[],
  pantryItems: PantryItemRow[],
) {
  const recipeLineByIngredientId = new Map<string, RecipeIngredientRow>();
  for (const line of recipeIngredients.slice().sort((left, right) => left.recipeId.localeCompare(right.recipeId))) {
    if (!recipeLineByIngredientId.has(line.ingredientId)) {
      recipeLineByIngredientId.set(line.ingredientId, line);
    }
  }

  const ingredientUpdates = ingredients.flatMap((ingredient) => {
    const line = recipeLineByIngredientId.get(ingredient.id);
    const normalizedName = parseIngredientDetails(ingredient.name, {
      quantity: line?.quantity,
      unit: line?.unit,
      brand: line?.brand,
    }).normalizedName;
    return normalizedName === ingredient.normalizedName
      ? []
      : [{ id: ingredient.id, normalizedName }];
  });

  const recipeIngredientUpdates = recipeIngredients.flatMap((ingredient) => {
    const parsed = parseIngredientDetails(ingredient.name, {
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    });
    const changes = {
      quantity: parsed.quantity,
      unit: parsed.unit,
      brand: ingredient.brand ?? parsed.brand,
      modifiers: ingredient.modifiers.length > 0 ? ingredient.modifiers : parsed.modifiers,
      packageQuantity: ingredient.packageQuantity ?? parsed.packageQuantity,
      packageUnit: ingredient.packageUnit ?? parsed.packageUnit,
    };
    if (
      changes.quantity === ingredient.quantity &&
      changes.unit === ingredient.unit &&
      changes.brand === ingredient.brand &&
      changes.packageQuantity === ingredient.packageQuantity &&
      changes.packageUnit === ingredient.packageUnit &&
      JSON.stringify(changes.modifiers) === JSON.stringify(ingredient.modifiers)
    ) {
      return [];
    }
    return [{ recipeId: ingredient.recipeId, ingredientId: ingredient.ingredientId, ...changes }];
  });

  const pantryItemUpdates = pantryItems.flatMap((item) => {
    const parsed = parseIngredientDetails(item.name, {
      quantity: item.quantity,
      unit: item.unit,
    });
    const changes = {
      normalizedName: parsed.normalizedName,
      quantity: parsed.quantity,
      unit: parsed.unit,
      brand: item.brand ?? parsed.brand,
      modifiers: item.modifiers.length > 0 ? item.modifiers : parsed.modifiers,
      packageQuantity: item.packageQuantity ?? parsed.packageQuantity,
      packageUnit: item.packageUnit ?? parsed.packageUnit,
    };
    if (
      changes.normalizedName === item.normalizedName &&
      changes.quantity === item.quantity &&
      changes.unit === item.unit &&
      changes.brand === item.brand &&
      changes.packageQuantity === item.packageQuantity &&
      changes.packageUnit === item.packageUnit &&
      JSON.stringify(changes.modifiers) === JSON.stringify(item.modifiers)
    ) {
      return [];
    }
    return [{ id: item.id, ...changes }];
  });

  const unknownPackageSizes = pantryItems
    .filter((item) => {
      const parsed = parseIngredientDetails(item.name, {
        quantity: item.quantity,
        unit: item.unit,
      });
      return parsed.packageQuantity === null && /^(can|bag|jar|bottle|carton|box|packet|package|tin|tub|pouch|container)s?$/iu.test(parsed.unit ?? "");
    })
    .map(({ id, name }) => ({ id, name }));

  return {
    ingredientUpdates,
    recipeIngredientUpdates,
    pantryItemUpdates,
    unknownPackageSizes,
  };
}

async function run() {
  const { prisma } = await import("@/lib/prisma");
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== "--apply" && argument !== "--details")) {
    throw new Error("Usage: pnpm --filter @pantry/web ingredient:backfill [--details] [--apply]");
  }
  const apply = args.includes("--apply");
  const showDetails = args.includes("--details");

  try {
    const [ingredients, recipeIngredients, pantryItems] = await Promise.all([
      prisma.ingredient.findMany({ select: { id: true, name: true, normalizedName: true } }),
      prisma.recipeIngredient.findMany({
        select: {
          recipeId: true,
          ingredientId: true,
          ingredient: { select: { name: true } },
          quantity: true,
          unit: true,
          brand: true,
          modifiers: true,
          packageQuantity: true,
          packageUnit: true,
        },
      }),
      prisma.pantryItem.findMany({
        select: {
          id: true,
          name: true,
          normalizedName: true,
          quantity: true,
          unit: true,
          brand: true,
          modifiers: true,
          packageQuantity: true,
          packageUnit: true,
        },
      }),
    ]);
    const plan = planIngredientDetailsBackfill(
      ingredients,
      recipeIngredients.map(({ ingredient, ...row }) => ({ ...row, name: ingredient.name })),
      pantryItems,
    );

    console.log(`${apply ? "Apply" : "Dry run"}: ${plan.ingredientUpdates.length} ingredient names, ${plan.recipeIngredientUpdates.length} recipe lines, ${plan.pantryItemUpdates.length} pantry items to update.`);
    console.log(`${plan.unknownPackageSizes.length} pantry packages have no stated size and cannot yield an exact weight.`);
    if (showDetails) {
      for (const update of plan.recipeIngredientUpdates) {
        const previous = recipeIngredients.find(
          (row) => row.recipeId === update.recipeId && row.ingredientId === update.ingredientId,
        );
        console.log(JSON.stringify({
          recipeId: update.recipeId,
          ingredientId: update.ingredientId,
          name: previous?.ingredient.name,
          before: previous && {
            quantity: previous.quantity,
            unit: previous.unit,
            brand: previous.brand,
            modifiers: previous.modifiers,
            packageQuantity: previous.packageQuantity,
            packageUnit: previous.packageUnit,
          },
          after: update,
        }));
      }
    }
    for (const item of plan.unknownPackageSizes) {
      console.log(`  ${item.id}: ${JSON.stringify(item.name)}`);
    }

    if (!apply) {
      console.log("No changes written. Re-run with --apply to backfill.");
      return;
    }

    await prisma.$transaction(async (transaction) => {
      for (const update of plan.ingredientUpdates) {
        await transaction.ingredient.update({ where: { id: update.id }, data: { normalizedName: update.normalizedName } });
      }
      for (const update of plan.recipeIngredientUpdates) {
        const { recipeId, ingredientId, ...data } = update;
        await transaction.recipeIngredient.update({ where: { recipeId_ingredientId: { recipeId, ingredientId } }, data });
      }
      for (const update of plan.pantryItemUpdates) {
        const { id, ...data } = update;
        await transaction.pantryItem.update({ where: { id }, data });
      }
    }, { timeout: BACKFILL_TRANSACTION_TIMEOUT_MS });
    console.log("Backfill complete. Original name values were not changed.");
  } finally {
    await prisma.$disconnect();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
