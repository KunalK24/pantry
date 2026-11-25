import {
  getSessionUser,
  SESSION_MAX_AGE_SECONDS,
  type CreatedSession,
  type PublicUser,
} from "@/services/auth-service";

export const SESSION_COOKIE_NAME = "pantry_session";
const bearerTokenPattern = /^Bearer ([A-Za-z0-9_-]{43})$/;

type RequestCredential =
  | { kind: "bearer"; token: string }
  | { kind: "cookie"; token: string }
  | { kind: "none" }
  | { kind: "invalid" };

function cookieOptions(maxAgeSeconds: number) {
  const options = [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (process.env.NODE_ENV === "production") {
    options.push("Secure");
  }

  return options;
}

function serializeCookie(value: string, maxAgeSeconds: number) {
  return [
    `${SESSION_COOKIE_NAME}=${value}`,
    ...cookieOptions(maxAgeSeconds),
  ].join("; ");
}

export function sessionCookie(session: CreatedSession) {
  return serializeCookie(session.token, SESSION_MAX_AGE_SECONDS);
}

export function clearSessionCookie() {
  return serializeCookie("", 0);
}

export function getSessionToken(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split("=");

    if (rawName === SESSION_COOKIE_NAME) {
      const value = rawValue.join("=");
      return value || null;
    }
  }

  return null;
}

function hasSessionCookie(request: Request) {
  return request.headers.get("cookie")?.split(";").some((cookie) =>
    cookie.trim().split("=", 1)[0] === SESSION_COOKIE_NAME
  ) ?? false;
}

export function getBearerSessionToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization || hasSessionCookie(request)) {
    return null;
  }

  return bearerTokenPattern.exec(authorization)?.[1] ?? null;
}

function resolveCredential(request: Request): RequestCredential {
  if (request.headers.has("authorization")) {
    const token = getBearerSessionToken(request);
    return token ? { kind: "bearer", token } : { kind: "invalid" };
  }

  const token = getSessionToken(request);
  return token ? { kind: "cookie", token } : { kind: "none" };
}

function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function getAuthenticatedUser(
  request: Request,
): Promise<PublicUser | null> {
  const credential = resolveCredential(request);
  if (credential.kind === "none" || credential.kind === "invalid") {
    return null;
  }

  return getSessionUser(credential.token);
}

export async function requireAuth(request: Request) {
  const credential = resolveCredential(request);
  if (credential.kind === "invalid") {
    return { user: null, response: unauthorizedResponse() };
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const originResponse = credential.kind === "bearer"
      ? checkNativeRequestOrigin(request)
      : checkRequestOrigin(request);
    if (originResponse) {
      return { user: null, response: originResponse };
    }
  }

  const user = credential.kind === "none"
    ? null
    : await getSessionUser(credential.token);

  if (!user) {
    return {
      user: null,
      response: unauthorizedResponse(),
    };
  }

  return {
    user,
    response: null,
  };
}

export function checkNativeRequestOrigin(request: Request): Response | null {
  if (process.env.NODE_ENV === "production") {
    const configuredOrigin = process.env.APP_ORIGIN;
    try {
      const url = new URL(configuredOrigin ?? "");
      if (url.protocol !== "https:" || url.origin !== configuredOrigin) {
        return Response.json({ error: "Service Unavailable" }, { status: 503 });
      }
    } catch {
      return Response.json({ error: "Service Unavailable" }, { status: 503 });
    }
  }

  return request.headers.has("origin") ? checkRequestOrigin(request) : null;
}

export function checkRequestOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const configuredOrigin = process.env.APP_ORIGIN;
  if (!configuredOrigin && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Service Unavailable" }, { status: 503 });
  }

  let expectedOrigin: string;
  if (configuredOrigin) {
    try {
      const url = new URL(configuredOrigin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        configuredOrigin !== url.origin
      ) {
        throw new Error("APP_ORIGIN must be an origin");
      }
      expectedOrigin = url.origin;
    } catch {
      return Response.json({ error: "Service Unavailable" }, { status: 503 });
    }
  } else {
    expectedOrigin = new URL(request.url).origin;
  }

  const allowedOrigins = new Set([expectedOrigin]);

  if (process.env.VERCEL === "1") {
    for (const hostname of [
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_ENV === "production"
        ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        : undefined,
    ]) {
      if (!hostname) {
        continue;
      }

      try {
        const deploymentOrigin = `https://${hostname}`;
        if (new URL(deploymentOrigin).origin === deploymentOrigin) {
          allowedOrigins.add(deploymentOrigin);
        }
      } catch {
        // Ignore malformed deployment hostnames.
      }
    }
  }

  if (!origin || !allowedOrigins.has(origin)) {
    return Response.json({ error: "Forbidden origin" }, { status: 403 });
  }

  return null;
}
