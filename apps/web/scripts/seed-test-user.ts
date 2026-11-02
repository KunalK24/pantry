import "dotenv/config";

import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { normalizeIngredientName } from "@/lib/ingredient-normalization";
import { addLocalDays, formatLocalDate, getLocalWeekStart } from "@/lib/week";
import { signUpSchema } from "@/schemas/auth";
import { weekStartToDate } from "@/schemas/weekly-plan";
import { pantryItems, recipes, TEST_USER_EMAIL, TEST_USER_ID } from "./test-user-fixture";

const scrypt = promisify(scryptCallback);

function expirationDate(today: Date, offsetDays?: number): Date | null {
  if (offsetDays === undefined) {
    return null;
  }

  const localDate = addLocalDays(today, offsetDays);
  return new Date(`${formatLocalDate(localDate)}T00:00:00.000Z`);
}

async function run() {
  if (process.argv.length !== 2) {
    throw new Error("Usage: pnpm --filter @pantry/web test-user:seed");
  }

  const password = process.env.PANTRY_TEST_PASSWORD;
  if (!password) {
    throw new Error("Set PANTRY_TEST_PASSWORD to a password of 8–200 characters.");
  }
  signUpSchema.parse({ email: TEST_USER_EMAIL, password });

  const salt = randomBytes(16).toString("base64url");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const passwordHash = `scrypt$${salt}$${derivedKey.toString("base64url")}`;
  const { prisma } = await import("@/lib/prisma");
  const today = new Date();

  try {
    await prisma.$transaction(async (transaction) => {
      const [existingEmail, existingId] = await Promise.all([
        transaction.user.findUnique({ where: { email: TEST_USER_EMAIL }, select: { id: true } }),
        transaction.user.findUnique({ where: { id: TEST_USER_ID }, select: { email: true } }),
      ]);
      if (existingEmail || existingId) {
        throw new Error("The reserved test account already exists. Run test-user:remove --apply before reseeding; no data was changed.");
      }

      await transaction.user.create({
        data: { id: TEST_USER_ID, email: TEST_USER_EMAIL, passwordHash },
      });

      await transaction.pantryItem.createMany({
        data: pantryItems.map((item) => ({
          userId: TEST_USER_ID,
          name: item.name,
          normalizedName: normalizeIngredientName(item.name),
          quantity: item.quantity,
          unit: item.unit,
          location: item.location,
          expiresOn: expirationDate(today, item.expirationOffsetDays),
        })),
      });

      const createdRecipes = [];
      for (const recipe of recipes) {
        createdRecipes.push(await transaction.recipe.create({
          data: {
            userId: TEST_USER_ID,
            name: recipe.name,
            description: recipe.description,
            instructions: recipe.instructions,
            mealType: recipe.mealType,
            timeMinutes: recipe.timeMinutes,
            isFavorite: recipe.isFavorite ?? false,
            ingredients: {
              create: recipe.ingredients.map((ingredient) => ({
                quantity: ingredient.quantity,
                unit: ingredient.unit ?? null,
                ingredient: { create: { name: ingredient.name } },
              })),
            },
          },
          select: { id: true },
        }));
      }

      const weekStart = weekStartToDate(formatLocalDate(getLocalWeekStart()));
      const plan = await transaction.weeklyPlan.create({
        data: {
          userId: TEST_USER_ID,
          weekStart,
          meals: {
            create: createdRecipes.slice(0, 5).map((recipe, dayOffset) => ({
              recipeId: recipe.id,
              dayOffset,
              position: 0,
            })),
          },
        },
      });

      await transaction.groceryList.create({
        data: {
          userId: TEST_USER_ID,
          key: "active",
          importedWeeklyPlanId: plan.id,
          recipes: {
            create: createdRecipes.map((recipe, index) => ({
              recipeId: recipe.id,
              source: index < 5 ? "WEEKLY_PLAN" : "MANUAL",
            })),
          },
          items: {
            create: [
              { lineKey: "banana", name: "Banana", baseQuantity: "1", baseUnit: "", checked: false },
              { lineKey: "vegetable-broth", name: "Vegetable broth", baseQuantity: "2", baseUnit: "cups", checked: false },
            ],
          },
        },
      });
    }, { timeout: 30_000 });

    console.log(`Seeded ${TEST_USER_EMAIL} with ${recipes.length} recipes, ${pantryItems.length} pantry items, a weekly plan, and an active grocery list.`);
    console.log("Sign in with PANTRY_TEST_PASSWORD. Run test-user:remove --apply to delete this account and its data.");
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
