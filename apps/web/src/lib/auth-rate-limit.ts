import { createHash } from "node:crypto";
import { isIP } from "node:net";

import IORedis from "ioredis";

type AuthAction = "sign-in" | "sign-up";

type RateLimitResult =
  | { status: "allowed" }
  | { status: "limited"; retryAfterSeconds: number }
  | { status: "unavailable" };

const AUTH_RATE_LIMITS = {
  "sign-in": { emailLimit: 10, sourceLimit: 60, windowSeconds: 15 * 60 },
  "sign-up": { emailLimit: 5, sourceLimit: 20, windowSeconds: 60 * 60 },
} as const;

// Both counters and their expiration are updated in one Redis operation.
const RATE_LIMIT_SCRIPT = `
local emailCount = redis.call("INCR", KEYS[1])
if emailCount == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
local sourceCount = redis.call("INCR", KEYS[2])
if sourceCount == 1 then redis.call("EXPIRE", KEYS[2], ARGV[1]) end
return {emailCount, sourceCount, redis.call("TTL", KEYS[1]), redis.call("TTL", KEYS[2])}
`;

type LimiterConnection = {
  client: IORedis;
  isInvalidated: boolean;
  redisUrl: string;
  ready: Promise<void>;
};

let sharedConnection: LimiterConnection | undefined;

function invalidateConnection(connection: LimiterConnection) {
  if (connection.isInvalidated) {
    return;
  }
  connection.isInvalidated = true;
  if (sharedConnection === connection) {
    sharedConnection = undefined;
  }
  connection.client.disconnect();
}

function getLimiterConnection(redisUrl: string): LimiterConnection {
  if (sharedConnection?.redisUrl === redisUrl) {
    return sharedConnection;
  }

  if (sharedConnection) {
    invalidateConnection(sharedConnection);
  }

  const client = new IORedis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 1000,
    commandTimeout: 1000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  const connection: LimiterConnection = {
    client,
    isInvalidated: false,
    redisUrl,
    ready: Promise.resolve().then(async () => {
      await client.connect();
    }),
  };
  client.on("error", (error) => {
    console.error("Auth rate limit Redis error", error);
    invalidateConnection(connection);
  });
  sharedConnection = connection;
  return connection;
}

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

export async function checkAuthRateLimit(
  action: AuthAction,
  email: string,
  request: Request,
): Promise<RateLimitResult> {
  const redisUrl = process.env.REDIS_URL;
  const source = getClientSource(request);
  if (!redisUrl || !source) {
    return { status: "unavailable" };
  }

  const { emailLimit, sourceLimit, windowSeconds } = AUTH_RATE_LIMITS[action];
  const emailHash = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  const sourceHash = createHash("sha256").update(source).digest("hex");
  let connection: LimiterConnection | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    connection = getLimiterConnection(redisUrl);
    const limiter = connection;
    const counts = await Promise.race([
      (async () => {
        await limiter.ready;
        if (sharedConnection !== limiter) {
          throw new Error("Auth rate limit Redis connection invalidated");
        }
        return limiter.client.eval(
          RATE_LIMIT_SCRIPT,
          2,
          `auth-limit:${action}:email:${emailHash}`,
          `auth-limit:${action}:source:${sourceHash}`,
          windowSeconds,
        );
      })(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Auth rate limit Redis timeout")),
          2000,
        );
      }),
    ]);

    if (!Array.isArray(counts) || counts.length !== 4) {
      throw new Error("Unexpected auth rate-limit response");
    }

    const [emailCount, sourceCount, emailTtl, sourceTtl] = counts.map(Number);
    if ([emailCount, sourceCount, emailTtl, sourceTtl].some(Number.isNaN)) {
      throw new Error("Invalid auth rate-limit response");
    }

    if (emailCount > emailLimit || sourceCount > sourceLimit) {
      const retryAfterSeconds = Math.max(
        1,
        ...(emailCount > emailLimit ? [emailTtl] : []),
        ...(sourceCount > sourceLimit ? [sourceTtl] : []),
      );
      return { status: "limited", retryAfterSeconds };
    }

    return { status: "allowed" };
  } catch (error) {
    console.error("Auth rate limit unavailable", error);
    if (connection) {
      invalidateConnection(connection);
    }
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeoutId);
  }
}
