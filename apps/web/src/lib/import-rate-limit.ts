import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

type ImportRateLimitResult =
  | { status: "allowed" }
  | { status: "limited"; retryAfterSeconds: number }
  | { status: "unavailable" };

const IMPORT_LIMIT = 20;
const WINDOW_SECONDS = 24 * 60 * 60;

export async function checkImportRateLimit(
  userId: string,
): Promise<ImportRateLimitResult> {
  const userHash = createHash("sha256").update(userId).digest("hex");
  const key = `import:user:${userHash}`;

  try {
    const buckets = await prisma.$queryRaw<
      { count: number; expiresAt: Date }[]
    >`
      INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt")
      VALUES (${key}, 1, CURRENT_TIMESTAMP + (${WINDOW_SECONDS} * INTERVAL '1 second'))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "AuthRateLimit"."expiresAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "AuthRateLimit"."count" + 1
        END,
        "expiresAt" = CASE
          WHEN "AuthRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${WINDOW_SECONDS} * INTERVAL '1 second')
          ELSE "AuthRateLimit"."expiresAt"
        END
      RETURNING "count", "expiresAt"
    `;
    const bucket = buckets[0];
    if (!bucket) {
      throw new Error("Import rate limit bucket was not returned");
    }

    if (bucket.count > IMPORT_LIMIT) {
      return {
        status: "limited",
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.expiresAt.getTime() - Date.now()) / 1000),
        ),
      };
    }

    return { status: "allowed" };
  } catch (error) {
    console.error("Import rate limit unavailable", error);
    return { status: "unavailable" };
  }
}
