import { beforeEach, describe, expect, it, vi } from "vitest";

const { constructorMock, connectMock, disconnectMock, evalMock } = vi.hoisted(
  () => ({
    constructorMock: vi.fn(),
    connectMock: vi.fn(),
    disconnectMock: vi.fn(),
    evalMock: vi.fn(),
  }),
);

vi.mock("ioredis", () => ({
  default: class {
    constructor() {
      constructorMock();
    }
    connect = connectMock;
    disconnect = disconnectMock;
    eval = evalMock;
    on = vi.fn();
  },
}));

let checkAuthRateLimit: typeof import("@/lib/auth-rate-limit").checkAuthRateLimit;

function authRequest(headers?: HeadersInit) {
  return new Request("https://pantry.example.com/api/auth/sign-in", {
    headers,
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AUTH_CLIENT_IP_HEADER", "");
  connectMock.mockResolvedValue(undefined);
  evalMock.mockResolvedValue([1, 1, 900, 900]);
  ({ checkAuthRateLimit } = await import("@/lib/auth-rate-limit"));
});

describe("auth rate limiting", () => {
  it("uses one atomic Redis call with hashed normalized email and source keys", async () => {
    const first = await checkAuthRateLimit(
      "sign-in",
      " Cook@Example.COM ",
      authRequest(),
    );
    const firstKeys = evalMock.mock.calls[0].slice(2, 4);
    const second = await checkAuthRateLimit(
      "sign-in",
      "cook@example.com",
      authRequest(),
    );
    const secondKeys = evalMock.mock.calls[1].slice(2, 4);

    expect(first).toEqual({ status: "allowed" });
    expect(second).toEqual({ status: "allowed" });
    expect(firstKeys).toEqual(secondKeys);
    expect(firstKeys[0]).not.toContain("cook@example.com");
    expect(firstKeys[1]).toMatch(/^auth-limit:sign-in:source:[a-f0-9]{64}$/);
    expect(evalMock.mock.calls[0][4]).toBe(900);
    expect(constructorMock).toHaveBeenCalledOnce();
    expect(connectMock).toHaveBeenCalledOnce();
    expect(disconnectMock).not.toHaveBeenCalled();
  });

  it("shares one in-flight connection across concurrent auth requests", async () => {
    let finishConnecting = () => {};
    connectMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishConnecting = resolve;
        }),
    );

    const first = checkAuthRateLimit(
      "sign-in",
      "first@example.com",
      authRequest(),
    );
    const second = checkAuthRateLimit(
      "sign-in",
      "second@example.com",
      authRequest(),
    );
    await Promise.resolve();

    expect(constructorMock).toHaveBeenCalledOnce();
    expect(connectMock).toHaveBeenCalledOnce();
    finishConnecting();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "allowed" },
      { status: "allowed" },
    ]);
    expect(evalMock).toHaveBeenCalledTimes(2);
  });

  it("uses only the configured trusted IP header and separates source buckets", async () => {
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
      authRequest({
        "x-trusted-client-ip": "203.0.113.11",
        "x-forwarded-for": "198.51.100.1",
      }),
    );

    const keys = evalMock.mock.calls.map((call) => call[3]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
    expect(keys[0]).not.toContain("203.0.113.10");
  });

  it("fails closed in production without one valid trusted IP", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const missingConfig = await checkAuthRateLimit(
      "sign-in",
      "cook@example.com",
      authRequest(),
    );
    vi.stubEnv("AUTH_CLIENT_IP_HEADER", "x-trusted-client-ip");
    const missingHeader = await checkAuthRateLimit(
      "sign-in",
      "cook@example.com",
      authRequest(),
    );
    const multipleIps = await checkAuthRateLimit(
      "sign-in",
      "cook@example.com",
      authRequest({
        "x-trusted-client-ip": "203.0.113.10, 198.51.100.1",
      }),
    );
    const invalidIp = await checkAuthRateLimit(
      "sign-in",
      "cook@example.com",
      authRequest({
        "x-trusted-client-ip": "not-an-ip",
      }),
    );

    expect([missingConfig, missingHeader, multipleIps, invalidIp]).toEqual(
      Array.from({ length: 4 }, () => ({ status: "unavailable" })),
    );
    expect(constructorMock).not.toHaveBeenCalled();
  });

  it("returns the longer Retry-After when both signup limits are exceeded", async () => {
    evalMock.mockResolvedValue([6, 21, 120, 180]);

    await expect(
      checkAuthRateLimit("sign-up", "cook@example.com", authRequest()),
    ).resolves.toEqual({
      status: "limited",
      retryAfterSeconds: 180,
    });
    expect(evalMock.mock.calls[0][4]).toBe(3600);
  });

  it("fails closed when Redis is unavailable", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    connectMock.mockRejectedValue(new Error("connection failed"));

    await expect(
      checkAuthRateLimit("sign-in", "cook@example.com", authRequest()),
    ).resolves.toEqual({
      status: "unavailable",
    });
    expect(evalMock).not.toHaveBeenCalled();
    expect(disconnectMock).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("creates a new shared client after an operation fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    evalMock.mockRejectedValueOnce(new Error("Redis command failed"));

    await expect(
      checkAuthRateLimit("sign-in", "cook@example.com", authRequest()),
    ).resolves.toEqual({ status: "unavailable" });
    await expect(
      checkAuthRateLimit("sign-in", "cook@example.com", authRequest()),
    ).resolves.toEqual({ status: "allowed" });
    expect(constructorMock).toHaveBeenCalledTimes(2);
    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(disconnectMock).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("fails closed when Redis client construction throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    constructorMock.mockImplementationOnce(() => {
      throw new Error("Invalid Redis URL");
    });

    await expect(
      checkAuthRateLimit("sign-in", "cook@example.com", authRequest()),
    ).resolves.toEqual({
      status: "unavailable",
    });
    expect(connectMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("disconnects and fails closed when connection stalls", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let finishConnecting = () => {};
    connectMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishConnecting = resolve;
        }),
    );
    vi.useFakeTimers();

    try {
      const result = checkAuthRateLimit(
        "sign-in",
        "cook@example.com",
        authRequest(),
      );
      await vi.advanceTimersByTimeAsync(2000);

      await expect(result).resolves.toEqual({ status: "unavailable" });
      expect(disconnectMock).toHaveBeenCalledOnce();
      finishConnecting();
      await Promise.resolve();
      expect(evalMock).not.toHaveBeenCalled();
      await expect(
        checkAuthRateLimit("sign-in", "cook@example.com", authRequest()),
      ).resolves.toEqual({ status: "allowed" });
      expect(constructorMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      consoleError.mockRestore();
    }
  });
});
