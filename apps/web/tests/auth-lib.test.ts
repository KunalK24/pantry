import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
}));

vi.mock("@/services/auth-service", () => ({
  getSessionUser: getSessionUserMock,
  SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 30,
}));

import {
  clearSessionCookie,
  checkNativeRequestOrigin,
  checkRequestOrigin,
  getAuthenticatedUser,
  getBearerSessionToken,
  getSessionToken,
  requireAuth,
  sessionCookie,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const bearerToken = "a".repeat(43);
const user = { id: "user-1", email: "cook@example.com" };

beforeEach(() => {
  getSessionUserMock.mockReset();
});

describe("auth cookie helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serializes session cookies for local development without Secure", () => {
    vi.stubEnv("NODE_ENV", "test");

    const cookie = sessionCookie({
      token: "raw-token",
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    });

    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=raw-token`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
    expect(cookie).not.toContain("Secure");
  });

  it("adds Secure to session cookies in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(
      sessionCookie({
        token: "raw-token",
        expiresAt: new Date("2026-11-01T00:00:00.000Z"),
      }),
    ).toContain("Secure");
  });

  it("clears the session cookie with Max-Age 0", () => {
    expect(clearSessionCookie()).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });

  it("extracts the session token from a cookie header", () => {
    const request = new Request("http://localhost:3000/api/auth/me", {
      headers: {
        cookie: "theme=dark; pantry_session=raw-token=value; other=1",
      },
    });

    expect(getSessionToken(request)).toBe("raw-token=value");
  });

  it("allows same-origin writes and safe reads without an Origin", async () => {
    const write = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const read = new Request("http://localhost:3000/api/recipes");

    expect(checkRequestOrigin(write)).toBeNull();
    expect((await requireAuth(read)).response?.status).toBe(401);
  });

  it("rejects missing and mismatched Origin before looking up a session", async () => {
    const missing = new Request("http://localhost:3000/api/recipes", {
      method: "POST",
    });
    const mismatched = new Request("http://localhost:3000/api/recipes", {
      method: "DELETE",
      headers: {
        origin: "https://evil.example",
        "x-forwarded-host": "evil.example",
      },
    });

    expect((await requireAuth(missing)).response?.status).toBe(403);
    expect((await requireAuth(mismatched)).response?.status).toBe(403);
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it("uses APP_ORIGIN when configured", () => {
    vi.stubEnv("APP_ORIGIN", "https://pantry.example.com");
    const request = new Request("http://internal:3000/api/recipes", {
      method: "POST",
      headers: { origin: "https://pantry.example.com" },
    });

    expect(checkRequestOrigin(request)).toBeNull();
  });

  it("accepts only this Vercel project's exact deployment origins", () => {
    vi.stubEnv("APP_ORIGIN", "https://pantry.example.com");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "pantry-abc.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "pantry-git-main.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "pantry.vercel.app");

    for (const origin of [
      "https://pantry.example.com",
      "https://pantry-abc.vercel.app",
      "https://pantry-git-main.vercel.app",
      "https://pantry.vercel.app",
    ]) {
      const request = new Request("http://internal:3000/api/auth/sign-in", {
        method: "POST",
        headers: { origin },
      });
      expect(checkRequestOrigin(request)).toBeNull();
    }

    const unrelated = new Request("http://internal:3000/api/auth/sign-in", {
      method: "POST",
      headers: { origin: "https://other-project.vercel.app" },
    });
    expect(checkRequestOrigin(unrelated)?.status).toBe(403);
  });

  it("ignores deployment hostnames outside Vercel or with URL paths", () => {
    vi.stubEnv("APP_ORIGIN", "https://pantry.example.com");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_URL", "pantry-abc.vercel.app");
    const request = new Request("http://internal:3000/api/auth/sign-in", {
      method: "POST",
      headers: { origin: "https://pantry-abc.vercel.app" },
    });

    expect(checkRequestOrigin(request)?.status).toBe(403);

    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "pantry-abc.vercel.app/path");
    expect(checkRequestOrigin(request)?.status).toBe(403);
  });

  it("does not trust the production URL on preview deployments", () => {
    vi.stubEnv("APP_ORIGIN", "https://pantry.example.com");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "pantry.vercel.app");
    const request = new Request("http://internal:3000/api/auth/sign-in", {
      method: "POST",
      headers: { origin: "https://pantry.vercel.app" },
    });

    expect(checkRequestOrigin(request)?.status).toBe(403);
  });

  it("requires an exact, valid APP_ORIGIN in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "");
    const request = new Request("https://pantry.example.com/api/recipes", {
      method: "POST",
      headers: { origin: "https://pantry.example.com" },
    });

    expect(checkRequestOrigin(request)?.status).toBe(503);
    vi.stubEnv("APP_ORIGIN", "https://pantry.example.com/path");
    expect(checkRequestOrigin(request)?.status).toBe(503);
    vi.stubEnv("APP_ORIGIN", "https://pantry.example.com");
    expect(checkRequestOrigin(request)).toBeNull();
  });
});

describe("mobile bearer credentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("authenticates a bearer read and an Origin-free bearer write", async () => {
    getSessionUserMock.mockResolvedValue(user);
    const read = new Request("http://localhost:3000/api/auth/me", {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
    const write = new Request("http://localhost:3000/api/pantry-items", {
      method: "POST",
      headers: { authorization: `Bearer ${bearerToken}` },
    });

    expect(getBearerSessionToken(read)).toBe(bearerToken);
    await expect(getAuthenticatedUser(read)).resolves.toEqual(user);
    expect((await requireAuth(write)).user).toEqual(user);
    expect(getSessionUserMock).toHaveBeenCalledWith(bearerToken);
  });

  it("rejects malformed and mixed credentials without cookie fallback", async () => {
    getSessionUserMock.mockResolvedValue(user);
    const malformedBearer = new Request("http://localhost:3000/api/auth/me", {
      headers: { authorization: "Bearer short" },
    });
    expect((await requireAuth(malformedBearer)).response?.status).toBe(401);
    for (const authorization of ["Basic abc", "Bearer short", `Bearer ${bearerToken}, Bearer ${bearerToken}`]) {
      const request = new Request("http://localhost:3000/api/auth/me", {
        headers: { authorization, cookie: "pantry_session=cookie-token" },
      });
      expect(getBearerSessionToken(request)).toBeNull();
      await expect(getAuthenticatedUser(request)).resolves.toBeNull();
      expect((await requireAuth(request)).response?.status).toBe(401);
    }
    const mixed = new Request("http://localhost:3000/api/auth/me", {
      headers: { authorization: `Bearer ${bearerToken}`, cookie: "pantry_session=" },
    });
    expect((await requireAuth(mixed)).response?.status).toBe(401);
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it("retains cookie Origin protection and rejects a hostile bearer Origin", async () => {
    getSessionUserMock.mockResolvedValue(user);
    const cookieWrite = new Request("http://localhost:3000/api/pantry-items", {
      method: "POST",
      headers: { cookie: "pantry_session=cookie-token" },
    });
    const bearerWrite = new Request("http://localhost:3000/api/pantry-items", {
      method: "POST",
      headers: { authorization: `Bearer ${bearerToken}`, origin: "https://evil.example" },
    });

    expect((await requireAuth(cookieWrite)).response?.status).toBe(403);
    expect((await requireAuth(bearerWrite)).response?.status).toBe(403);
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it("continues to authenticate a cookie write with the allowed Origin", async () => {
    getSessionUserMock.mockResolvedValue(user);
    const request = new Request("http://localhost:3000/api/pantry-items", {
      method: "POST",
      headers: { cookie: "pantry_session=cookie-token", origin: "http://localhost:3000" },
    });
    expect((await requireAuth(request)).user).toEqual(user);
    expect(getSessionUserMock).toHaveBeenCalledWith("cookie-token");
  });

  it("returns 401 for an expired or revoked bearer session", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const request = new Request("http://localhost:3000/api/pantry-items", {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
    expect((await requireAuth(request)).response?.status).toBe(401);
  });

  it("requires an HTTPS public origin for native production requests", () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new Request("http://internal:3000/api/mobile/auth/sign-in", { method: "POST" });
    vi.stubEnv("APP_ORIGIN", "");
    expect(checkNativeRequestOrigin(request)?.status).toBe(503);
    vi.stubEnv("APP_ORIGIN", "http://pantry.example.com");
    expect(checkNativeRequestOrigin(request)?.status).toBe(503);
    vi.stubEnv("APP_ORIGIN", "https://pantry.example.com");
    expect(checkNativeRequestOrigin(request)).toBeNull();
  });
});
