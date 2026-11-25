import "dotenv/config";

import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { signInSchema } from "@/schemas/auth";
import { hashInvitationToken } from "@/services/auth-service";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

async function run() {
  if (process.argv.length !== 4 || process.argv[2] !== "--email") {
    throw new Error("Usage: pnpm --filter @pantry/web invite:create --email person@example.com");
  }

  const email = signInSchema.shape.email.parse(process.argv[3]);
  const configuredOrigin = process.env.APP_ORIGIN;
  if (!configuredOrigin) {
    throw new Error("APP_ORIGIN must be configured before creating an invitation.");
  }
  const origin = new URL(configuredOrigin);
  if (origin.origin !== configuredOrigin) {
    throw new Error("APP_ORIGIN must be the public site origin without a path.");
  }
  if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
    throw new Error("APP_ORIGIN must use HTTPS outside localhost.");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInvitationToken(token);
  const tokenExpiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
  const [existingUser] = await prisma.$transaction([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.approvedEmail.upsert({
      where: { email },
      create: { email, tokenHash, tokenExpiresAt },
      update: { tokenHash, tokenExpiresAt, tokenUsedAt: null, approvedAt: new Date() },
    }),
  ]);

  if (existingUser) {
    console.log(`${email} is approved and already has an account. They can sign in now.`);
    return;
  }

  const link = new URL("/sign-up", origin);
  link.searchParams.set("invite", token);
  console.log(`Approved ${email}. Send this link privately; it expires ${tokenExpiresAt.toISOString()}:`);
  console.log(link.toString());
}

run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
