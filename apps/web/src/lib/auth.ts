import {
  getSessionUser,
  SESSION_MAX_AGE_SECONDS,
  type CreatedSession,
  type PublicUser,
} from "@/services/auth-service";

export const SESSION_COOKIE_NAME = "pantry_session";

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

export async function getAuthenticatedUser(
  request: Request,
): Promise<PublicUser | null> {
  const token = getSessionToken(request);

  if (!token) {
    return null;
  }

  return getSessionUser(token);
}

export async function requireAuth(request: Request) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const originResponse = checkRequestOrigin(request);
    if (originResponse) {
      return { user: null, response: originResponse };
    }
  }

  const user = await getAuthenticatedUser(request);

  if (!user) {
    return {
      user: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    user,
    response: null,
  };
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

  if (origin !== expectedOrigin) {
    return Response.json({ error: "Forbidden origin" }, { status: 403 });
  }

  return null;
}
