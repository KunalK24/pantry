import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRawMock, transactionMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: transactionMock },
}));

import { checkImportRateLimit } from "@/lib/import-rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("IMPORT_GLOBAL_DAILY_LIMIT", "");
  queryRawMock.mockResolvedValue([
    { count: 1, expiresAt: new Date(Date.now() + 60_000) },
  ]);
  transactionMock.mockImplementation((callback) => callback({ $queryRaw: queryRawMock }));
});

describe("import rate limiting", () => {
  it("counts a user and the whole app atomically", async () => {
    await expect(checkImportRateLimit("user-1")).resolves.toEqual({ status: "allowed" });
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(queryRawMock).toHaveBeenCalledTimes(2);
    const [userSql, userKey, seconds] = queryRawMock.mock.calls[0];
    const [globalSql, globalKey] = queryRawMock.mock.calls[1];
    expect(userKey).toMatch(/^import:user:[a-f0-9]{64}$/);
    expect(userKey).not.toContain("user-1");
    expect(globalKey).toBe("import:global");
    expect(seconds).toBe(86_400);
    expect(userSql.join(" ")).toContain("ON CONFLICT");
    expect(globalSql.join(" ")).toContain("ON CONFLICT");
  });

  it("limits the twenty-first request from one account", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    queryRawMock
      .mockResolvedValueOnce([{ count: 21, expiresAt }]);
    await expect(checkImportRateLimit("user-1")).resolves.toMatchObject({ status: "limited" });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("limits all accounts after the global allowance is reached", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    let committed = false;
    transactionMock.mockImplementation(async (callback) => {
      await callback({ $queryRaw: queryRawMock });
      committed = true;
    });
    queryRawMock
      .mockResolvedValueOnce([{ count: 1, expiresAt }])
      .mockResolvedValueOnce([{ count: 101, expiresAt }]);
    await expect(checkImportRateLimit("user-2")).resolves.toMatchObject({ status: "limited" });
    expect(committed).toBe(false);
  });

  it("fails closed if the database is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRawMock.mockRejectedValue(new Error("database unavailable"));
    await expect(checkImportRateLimit("user-1")).resolves.toEqual({ status: "unavailable" });
    consoleError.mockRestore();
  });
});
