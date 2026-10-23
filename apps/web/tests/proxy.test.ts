import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
}));

vi.mock("@/services/auth-service", () => ({
  getSessionUser: getSessionUserMock,
  SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 30,
}));

import { proxy } from "@/proxy";

function request(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function locationPath(response: Response) {
  const location = response.headers.get("location");

  return location ? new URL(location).pathname : null;
}

describe("proxy page auth redirects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects app pages to sign-in when no session cookie exists", async () => {
    const response = await proxy(request("/recipes"));

    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/sign-in");
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it("allows public auth pages when signed out", async () => {
    const response = await proxy(request("/sign-in"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not treat an arbitrary invalid session cookie as a valid page session", async () => {
    getSessionUserMock.mockResolvedValue(null);

    const response = await proxy(
      request("/recipes", "pantry_session=unknown-token"),
    );

    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/sign-in");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("redirects signed-in users away from auth pages", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "auth-user",
      email: "cook@example.com",
    });

    const response = await proxy(
      request("/sign-in", "pantry_session=valid-token"),
    );

    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/recipes");
  });
});
