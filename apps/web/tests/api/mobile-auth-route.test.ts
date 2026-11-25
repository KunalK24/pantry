import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock, signOutMock, checkAuthRateLimitMock, InvalidCredentialsErrorMock } = vi.hoisted(() => {
  class InvalidCredentialsErrorMock extends Error {}
  return {
    signInMock: vi.fn(),
    signOutMock: vi.fn(),
    checkAuthRateLimitMock: vi.fn(),
    InvalidCredentialsErrorMock,
  };
});

vi.mock("@/services/auth-service", () => ({
  signIn: signInMock,
  signOut: signOutMock,
  getSessionUser: vi.fn(),
  InvalidCredentialsError: InvalidCredentialsErrorMock,
  SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 30,
}));
vi.mock("@/lib/auth-rate-limit", () => ({
  checkAuthRateLimit: checkAuthRateLimitMock,
}));

import { POST as signInPOST } from "@/app/api/mobile/auth/sign-in/route";
import { POST as signOutPOST } from "@/app/api/mobile/auth/sign-out/route";

const bearerToken = "a".repeat(43);
const user = { id: "cm12345678901234567890123", email: "cook@example.com" };
const session = { token: bearerToken, expiresAt: new Date("2026-12-24T00:00:00.000Z") };

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/mobile/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("APP_ORIGIN", "");
  checkAuthRateLimitMock.mockResolvedValue({ status: "allowed" });
  signInMock.mockResolvedValue({ user, session });
});

describe("POST /api/mobile/auth/sign-in", () => {
  it("normalizes credentials and returns an uncached bearer session without a cookie", async () => {
    const response = await signInPOST(jsonRequest({
      email: " Cook@Example.COM ",
      password: "password123",
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      user,
      token: bearerToken,
      expiresAt: "2026-12-24T00:00:00.000Z",
    });
    expect(signInMock).toHaveBeenCalledWith({ email: user.email, password: "password123" });
    expect(checkAuthRateLimitMock).toHaveBeenCalledWith("sign-in", user.email, expect.any(Request));
  });

  it("rejects a hostile Origin before credential processing", async () => {
    const response = await signInPOST(jsonRequest(
      { email: user.email, password: "password123" },
      { origin: "https://evil.example" },
    ));
    expect(response.status).toBe(403);
    expect(checkAuthRateLimitMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("requires JSON and rejects malformed, invalid, and oversized bodies", async () => {
    const missingType = await signInPOST(new Request("http://localhost:3000/api/mobile/auth/sign-in", {
      method: "POST", body: "{}",
    }));
    expect(missingType.status).toBe(415);

    const malformed = await signInPOST(new Request("http://localhost:3000/api/mobile/auth/sign-in", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{",
    }));
    expect(malformed.status).toBe(400);

    const invalid = await signInPOST(jsonRequest({ email: "bad", password: "short" }));
    expect(invalid.status).toBe(400);

    const oversized = await signInPOST(jsonRequest({
      email: user.email,
      password: "x".repeat(8192),
    }));
    expect(oversized.status).toBe(413);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("returns generic invalid credentials and rate-limit errors", async () => {
    signInMock.mockRejectedValueOnce(new InvalidCredentialsErrorMock());
    const invalid = await signInPOST(jsonRequest({ email: user.email, password: "password123" }));
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toEqual({ error: "Invalid email or password" });

    checkAuthRateLimitMock.mockResolvedValueOnce({ status: "limited", retryAfterSeconds: 42 });
    const limited = await signInPOST(jsonRequest({ email: user.email, password: "password123" }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");

    checkAuthRateLimitMock.mockResolvedValueOnce({ status: "unavailable" });
    const unavailable = await signInPOST(jsonRequest({ email: user.email, password: "password123" }));
    expect(unavailable.status).toBe(503);
    expect(signInMock).toHaveBeenCalledTimes(1);
  });

  it("requires HTTPS APP_ORIGIN in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "http://pantry.example.com");
    const response = await signInPOST(jsonRequest({ email: user.email, password: "password123" }));
    expect(response.status).toBe(503);
    expect(signInMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/mobile/auth/sign-out", () => {
  it("revokes a bearer session without returning a cookie", async () => {
    const request = new Request("http://localhost:3000/api/mobile/auth/sign-out", {
      method: "POST", headers: { authorization: `Bearer ${bearerToken}` },
    });
    const response = await signOutPOST(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(signOutMock).toHaveBeenCalledWith(bearerToken);
  });

  it("rejects missing, malformed, and mixed credentials", async () => {
    const credentialHeaders: HeadersInit[] = [
      {},
      { authorization: "Bearer short" },
      { authorization: `Bearer ${bearerToken}`, cookie: "pantry_session=cookie-token" },
    ];
    for (const headers of credentialHeaders) {
      const response = await signOutPOST(new Request("http://localhost:3000/api/mobile/auth/sign-out", {
        method: "POST", headers,
      }));
      expect(response.status).toBe(401);
    }
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("rejects a hostile Origin before revoking", async () => {
    const response = await signOutPOST(new Request("http://localhost:3000/api/mobile/auth/sign-out", {
      method: "POST", headers: { authorization: `Bearer ${bearerToken}`, origin: "https://evil.example" },
    }));
    expect(response.status).toBe(403);
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
