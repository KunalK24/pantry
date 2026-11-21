import "dotenv/config";

import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { normalizeIngredientName, titleCaseIngredientName } from "@/lib/ingredient-normalization";
import { addLocalDays, formatLocalDate } from "@/lib/week";
import { signUpSchema } from "@/schemas/auth";
import { pantryItems } from "./test-user-fixture";

const scrypt = promisify(scryptCallback);
const newAccountPassword = "1234567890";

function expirationDate(today: Date, offsetDays?: number): Date | null {
  if (offsetDays === undefined) {
    return null;
  }

  const localDate = addLocalDays(today, offsetDays);
  return new Date(`${formatLocalDate(localDate)}T00:00:00.000Z`);
}

export async function seedPantryItems(args: string[] = process.argv.slice(2)) {
  if (args.length !== 2 || args[0] !== "--email") {
    throw new Error("Usage: pnpm --filter @pantry/web pantry:seed --email user@example.com");
  }

  const { email } = signUpSchema.parse({ email: args[1], password: newAccountPassword });
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = (await scrypt(newAccountPassword, salt, 64)) as Buffer;
  const passwordHash = `scrypt$${salt}$${derivedKey.toString("base64url")}`;
  const { prisma } = await import("@/lib/prisma");
  const today = new Date();

  try {
    const result = await prisma.$transaction(async (transaction) => {
      let user = await transaction.user.findUnique({ where: { email }, select: { id: true } });
      const created = user === null;

      if (user === null) {
        user = await transaction.user.create({
          data: { email, passwordHash },
          select: { id: true },
        });
      }

      const seeded = await transaction.pantryItem.createMany({
        data: pantryItems.map((item) => ({
          userId: user.id,
          name: titleCaseIngredientName(item.name),
          normalizedName: normalizeIngredientName(item.name),
          quantity: item.quantity,
          unit: item.unit,
          location: item.location,
          expiresOn: expirationDate(today, item.expirationOffsetDays),
        })),
        skipDuplicates: true,
      });

      return { created, added: seeded.count };
    });

    console.log(`${result.created ? "Created" : "Found"} account ${email}. Added ${result.added} pantry items; skipped ${pantryItems.length - result.added} already present.`);
    if (result.created) {
      console.log(`Sign in to ${email} with the password ${newAccountPassword}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  seedPantryItems().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
