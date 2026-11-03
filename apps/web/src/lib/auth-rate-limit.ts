import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { prisma } from "@/lib/prisma";

type AuthAction = "sign-in" | "sign-up";

type RateLimitResult =
  | { status: "allowed" }
  | { status: "limited"; retryAfterSeconds: number }
  | { status: "unavailable" };

type BucketCount = { count: number; expiresAt: Date };

const AUTH_RATE_LIMITS = {
  "sign-in": { emailLimit: 10, sourceLimit: 60, windowSeconds: 15 * 60 },
  "sign-up": { emailLimit: 5, sourceLimit: 20, windowSeconds: 60 * 60 },
} as const;

function getClientSource(request: Request): string | null {
  if (process.env.NODE_ENV !== "production") {
    return "local";
  }

  const headerName = process.env.AUTH_CLIENT_IP_HEADER;
  if (!headerName) {
    return null;
  }

  try {
    const address = request.headers.get(headerName)?.trim();
    return address && isIP(address) ? address : null;
  } catch {
    return null;
  }
}

function hashBucketKey(action: AuthAction, dimension: "email" | "source", value: string) {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${action}:${dimension}:${hash}`;
}

export async function checkAuthRateLimit(
  action: AuthAction,
  email: string,
  request: Request,
): Promise<RateLimitResult> {
  const source = getClientSource(request);
  if (!source) {
    return { status: "unavailable" };
  }

  const { emailLimit, sourceLimit, windowSeconds } = AUTH_RATE_LIMITS[action];
  const emailKey = hashBucketKey(action, "email", email.trim().toLowerCase());
  const sourceKey = hashBucketKey(action, "source", source);

  try {
    const [emailBucket, sourceBucket] = await prisma.$transaction(
      async (tx) => {
        // One database upsert updates each counter atomically at window rollover.
        const incrementBucket = async (key: string) => {
          const buckets = await tx.$queryRaw<BucketCount[]>`
            INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt")
            VALUES (${key}, 1, CURRENT_TIMESTAMP + (${windowSeconds} * INTERVAL '1 second'))
            ON CONFLICT ("key") DO UPDATE SET
              "count" = CASE
                WHEN "AuthRateLimit"."expiresAt" <= CURRENT_TIMESTAMP THEN 1
                ELSE "AuthRateLimit"."count" + 1
              END,
              "expiresAt" = CASE
                WHEN "AuthRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
                  THEN CURRENT_TIMESTAMP + (${windowSeconds} * INTERVAL '1 second')
                ELSE "AuthRateLimit"."expiresAt"
              END
            RETURNING "count", "expiresAt"
          `;
          return buckets[0];
        };

        return [await incrementBucket(emailKey), await incrementBucket(sourceKey)];
      },
      { timeout: 5000 },
    );

    if (!emailBucket || !sourceBucket) {
      throw new Error("Auth rate limit bucket was not returned");
    }

    if (Math.random() < 0.01) {
      try {
        // Small opportunistic batches prevent unused email buckets accumulating.
        await prisma.$executeRaw`
          DELETE FROM "AuthRateLimit"
          WHERE "key" IN (
            SELECT "key" FROM "AuthRateLimit"
            WHERE "expiresAt" < CURRENT_TIMESTAMP
            ORDER BY "expiresAt"
            LIMIT 100
          )
        `;
      } catch (error) {
        console.error("Auth rate limit cleanup unavailable", error);
      }
    }

    const isEmailLimited = emailBucket.count > emailLimit;
    const isSourceLimited = sourceBucket.count > sourceLimit;
    if (isEmailLimited || isSourceLimited) {
      const retryAt = Math.max(
        ...(isEmailLimited ? [emailBucket.expiresAt.getTime()] : []),
        ...(isSourceLimited ? [sourceBucket.expiresAt.getTime()] : []),
      );
      return {
        status: "limited",
        retryAfterSeconds: Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)),
      };
    }

    return { status: "allowed" };
  } catch (error) {
    console.error("Auth rate limit unavailable", error);
    return { status: "unavailable" };
  }
}
