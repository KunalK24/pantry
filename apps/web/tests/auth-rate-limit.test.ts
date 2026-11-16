import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeRawMock, queryRawMock, transactionMock } = vi.hoisted(() => ({
  executeRawMock: vi.fn(),
  queryRawMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: executeRawMock, $transaction: transactionMock },
}));

import { checkAuthRateLimit } from "@/lib/auth-rate-limit";

function authRequest(headers?: HeadersInit) {
  return new Request("https://pantry.example.com/api/auth/sign-in", {
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AUTH_CLIENT_IP_HEADER", "");
  vi.spyOn(Math, "random").mockReturnValue(1);
  transactionMock.mockImplementation((operation) =>
    operation({ $queryRaw: queryRawMock }),
  );
  queryRawMock.mockResolvedValue([
    { count: 1, expiresAt: new Date(Date.now() + 900_000) },
  ]);
  executeRawMock.mockResolvedValue(0);
});

describe("auth rate limiting", () => {
  it("updates normalized hashed email and source buckets in one transaction", async () => {
    await expect(
      checkAuthRateLimit("sign-in", " Cook@Example.COM ", authRequest()),
    ).resolves.toEqual({ status: "allowed" });

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(queryRawMock).toHaveBeenCalledTimes(2);
    const firstCall = queryRawMock.mock.calls[0];
    const secondCall = queryRawMock.mock.calls[1];
    expect(firstCall[1]).toMatch(/^sign-in:email:[a-f0-9]{64}$/);
    expect(secondCall[1]).toMatch(/^sign-in:source:[a-f0-9]{64}$/);
    expect(firstCall[2]).toBe(900);
    expect(firstCall[3]).toBe(900);
    expect(firstCall[0].join(" ")).toContain("ON CONFLICT");
    expect(firstCall[0].join(" ")).toContain("RETURNING");

    await checkAuthRateLimit("sign-in", "cook@example.com", authRequest());
    expect(queryRawMock.mock.calls[2][1]).toBe(firstCall[1]);
  });

  it("uses only the configured single trusted IP in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_CLIENT_IP_HEADER", "x-trusted-client-ip");

    await checkAuthRateLimit(
      "sign-in",
      "cook@example.com",
      authRequest({
        "x-trusted-client-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.1",
      }),
    );
    await checkAuthRateLimit(
      "sign-in",
      "cook@example.com",
      authRequest({
        "x-trusted-client-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.2",
      }),
    );
    await checkAuthRateLimit(
      "sign-in",
      "cook@example.com",
      authRequest({ "x-trusted-client-ip": "203.0.113.11" }),
    );

    expect(queryRawMock.mock.calls[1][1]).toBe(queryRawMock.mock.calls[3][1]);
    expect(queryRawMock.mock.calls[1][1]).not.toBe(queryRawMock.mock.calls[5][1]);
  });

  it("fails closed without one valid trusted production IP", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const missingConfig = await checkAuthRateLimit(
      "sign-in", "cook@example.com", authRequest(),
    );
    vi.stubEnv("AUTH_CLIENT_IP_HEADER", "x-trusted-client-ip");
    const missingHeader = await checkAuthRateLimit(
      "sign-in", "cook@example.com", authRequest(),
    );
    const multipleIps = await checkAuthRateLimit(
      "sign-in", "cook@example.com",
      authRequest({ "x-trusted-client-ip": "203.0.113.10, 198.51.100.1" }),
    );
    const invalidIp = await checkAuthRateLimit(
      "sign-in", "cook@example.com",
      authRequest({ "x-trusted-client-ip": "not-an-ip" }),
    );

    expect([missingConfig, missingHeader, multipleIps, invalidIp]).toEqual(
      Array.from({ length: 4 }, () => ({ status: "unavailable" })),
    );
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns the longer Retry-After when both signup buckets exceed limits", async () => {
    const now = Date.now();
    queryRawMock
      .mockResolvedValueOnce([{ count: 6, expiresAt: new Date(now + 120_000) }])
      .mockResolvedValueOnce([{ count: 21, expiresAt: new Date(now + 180_000) }]);

    await expect(
      checkAuthRateLimit("sign-up", "cook@example.com", authRequest()),
    ).resolves.toEqual({ status: "limited", retryAfterSeconds: 180 });
    expect(queryRawMock.mock.calls[0][2]).toBe(3600);
  });

  it("fails closed when the database is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    transactionMock.mockRejectedValue(new Error("database unavailable"));

    await expect(
      checkAuthRateLimit("sign-in", "cook@example.com", authRequest()),
    ).resolves.toEqual({ status: "unavailable" });
    consoleError.mockRestore();
  });

  it("occasionally removes at most 100 expired buckets", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(
      checkAuthRateLimit("sign-in", "cook@example.com", authRequest()),
    ).resolves.toEqual({ status: "allowed" });

    expect(executeRawMock).toHaveBeenCalledOnce();
    expect(executeRawMock.mock.calls[0][0].join(" ")).toContain("LIMIT 100");
  });
});
