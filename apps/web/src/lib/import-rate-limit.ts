import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

type ImportRateLimitResult =
  | { status: "allowed" }
  | { status: "limited"; retryAfterSeconds: number }
  | { status: "unavailable" };

const IMPORT_LIMIT = 20;
const DEFAULT_GLOBAL_IMPORT_LIMIT = 100;
const WINDOW_SECONDS = 24 * 60 * 60;

class ImportLimitReached extends Error {
  constructor(readonly expiresAt: Date) {
    super("Import limit reached");
  }
}

function globalImportLimit() {
  const configured = process.env.IMPORT_GLOBAL_DAILY_LIMIT;
  if (configured === undefined || configured === "") {
    return DEFAULT_GLOBAL_IMPORT_LIMIT;
  }
  const limit = Number(configured);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("IMPORT_GLOBAL_DAILY_LIMIT must be a positive integer");
  }
  return limit;
}

export async function checkImportRateLimit(
  userId: string,
): Promise<ImportRateLimitResult> {
  const userHash = createHash("sha256").update(userId).digest("hex");
  const userKey = `import:user:${userHash}`;
  const globalKey = "import:global";

  try {
    const limit = globalImportLimit();
    await prisma.$transaction(async (tx) => {
      const increment = async (key: string) => {
        const buckets = await tx.$queryRaw<{ count: number; expiresAt: Date }[]>`
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
        return buckets[0];
      };
      const userBucket = await increment(userKey);
      if (!userBucket) {
        throw new Error("User import rate limit bucket was not returned");
      }
      if (userBucket.count > IMPORT_LIMIT) {
        throw new ImportLimitReached(userBucket.expiresAt);
      }

      const globalBucket = await increment(globalKey);
      if (!globalBucket) {
        throw new Error("Global import rate limit bucket was not returned");
      }
      if (globalBucket.count > limit) {
        throw new ImportLimitReached(globalBucket.expiresAt);
      }
    });

    return { status: "allowed" };
  } catch (error) {
    if (error instanceof ImportLimitReached) {
      return {
        status: "limited",
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((error.expiresAt.getTime() - Date.now()) / 1000),
        ),
      };
    }
    console.error("Import rate limit unavailable", error);
    return { status: "unavailable" };
  }
}
