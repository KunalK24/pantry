import "dotenv/config";

import { pathToFileURL } from "node:url";

import { TEST_USER_EMAIL, TEST_USER_ID } from "./test-user-fixture";

async function run() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && args[0] !== "--apply")) {
    throw new Error("Usage: pnpm --filter @pantry/web test-user:remove [--apply]");
  }

  const { prisma } = await import("@/lib/prisma");
  try {
    const user = await prisma.user.findUnique({
      where: { id: TEST_USER_ID },
      select: {
        email: true,
        _count: { select: { recipes: true, pantryItems: true, weeklyPlans: true, groceryLists: true, sessions: true, aiJobs: true } },
      },
    });

    if (!user) {
      console.log("Reserved test account does not exist. Nothing to remove.");
      return;
    }
    if (user.email !== TEST_USER_EMAIL) {
      throw new Error("Reserved test user ID has a different email; refusing to remove it.");
    }

    console.log(`Account: ${TEST_USER_EMAIL}`);
    console.log(`Owned records: ${JSON.stringify(user._count)}`);
    if (args[0] !== "--apply") {
      console.log("Dry run. Add --apply to remove the account and all its owned data.");
      return;
    }

    await prisma.$transaction(async (transaction) => {
      const currentUser = await transaction.user.findUnique({
        where: { id: TEST_USER_ID },
        select: { email: true },
      });
      if (currentUser?.email !== TEST_USER_EMAIL) {
        throw new Error("Reserved test account changed during cleanup; no data was removed.");
      }

      const links = await transaction.recipeIngredient.findMany({
        where: { recipe: { userId: TEST_USER_ID } },
        select: { ingredientId: true },
      });
      await transaction.recipeIngredient.deleteMany({
        where: { recipe: { userId: TEST_USER_ID } },
      });
      await transaction.user.delete({ where: { id: TEST_USER_ID, email: TEST_USER_EMAIL } });

      await transaction.ingredient.deleteMany({
        where: {
          id: { in: [...new Set(links.map((link) => link.ingredientId))] },
          recipes: { none: {} },
        },
      });
    }, { timeout: 30_000 });

    console.log("Removed test account and all owned data.");
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
