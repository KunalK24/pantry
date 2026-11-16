import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRawMock } = vi.hoisted(() => ({ queryRawMock: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRawMock },
}));

import { checkImportRateLimit } from "@/lib/import-rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  queryRawMock.mockResolvedValue([
    { count: 1, expiresAt: new Date(Date.now() + 86_400_000) },
  ]);
});

describe("import rate limiting", () => {
  it("uses one atomic daily bucket per user without storing the raw ID", async () => {
    await expect(checkImportRateLimit("user-1")).resolves.toEqual({
      status: "allowed",
    });

    expect(queryRawMock).toHaveBeenCalledOnce();
    const [sql, key, windowSeconds, rolloverSeconds] = queryRawMock.mock.calls[0];
    expect(key).toMatch(/^import:user:[a-f0-9]{64}$/);
    expect(key).not.toContain("user-1");
    expect(windowSeconds).toBe(86_400);
    expect(rolloverSeconds).toBe(86_400);
    expect(sql.join(" ")).toContain("ON CONFLICT");

    await checkImportRateLimit("user-1");
    await checkImportRateLimit("user-2");
    expect(queryRawMock.mock.calls[1][1]).toBe(key);
    expect(queryRawMock.mock.calls[2][1]).not.toBe(key);
  });

  it("allows the twentieth request and limits the twenty-first", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    queryRawMock
      .mockResolvedValueOnce([{ count: 20, expiresAt }])
      .mockResolvedValueOnce([{ count: 21, expiresAt }]);

    await expect(checkImportRateLimit("user-1")).resolves.toEqual({
      status: "allowed",
    });
    await expect(checkImportRateLimit("user-1")).resolves.toEqual({
      status: "limited",
      retryAfterSeconds: 60,
    });
  });

  it("fails closed if the database is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRawMock.mockRejectedValue(new Error("database unavailable"));

    await expect(checkImportRateLimit("user-1")).resolves.toEqual({
      status: "unavailable",
    });
    consoleError.mockRestore();
  });
});
