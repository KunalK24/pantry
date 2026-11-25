import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  findUser: vi.fn(),
  createUser: vi.fn(),
  createItems: vi.fn(),
  approveEmail: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (callback: (transaction: unknown) => Promise<unknown>) => callback({
      user: { findUnique: database.findUser, create: database.createUser },
      pantryItem: { createMany: database.createItems },
      approvedEmail: { upsert: database.approveEmail },
    }),
    $disconnect: database.disconnect,
  },
}));

import { seedPantryItems } from "./seed-pantry-items";

describe("targeted pantry seed", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    database.findUser.mockReset();
    database.createUser.mockReset();
    database.createItems.mockReset();
    database.approveEmail.mockReset();
    database.disconnect.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses an existing account and skips matching pantry items", async () => {
    database.findUser.mockResolvedValue({ id: "existing-user" });
    database.createItems.mockResolvedValue({ count: 19 });

    await seedPantryItems(["--email", " Person@Example.com "]);

    expect(database.findUser).toHaveBeenCalledWith({ where: { email: "person@example.com" }, select: { id: true } });
    expect(database.createUser).not.toHaveBeenCalled();
    expect(database.approveEmail).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: "person@example.com" },
    }));
    expect(database.createItems).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: expect.arrayContaining([expect.objectContaining({ userId: "existing-user", normalizedName: "eggs" })]),
    }));
    expect(database.disconnect).toHaveBeenCalledOnce();
  });

  it("creates a missing account with a hashed password before seeding", async () => {
    database.findUser.mockResolvedValue(null);
    database.createUser.mockResolvedValue({ id: "new-user" });
    database.createItems.mockResolvedValue({ count: 21 });

    await seedPantryItems(["--email", "new@example.com"]);

    expect(database.createUser).toHaveBeenCalledWith({
      data: { email: "new@example.com", passwordHash: expect.stringMatching(/^scrypt\$[^$]+\$[^$]+$/) },
      select: { id: true },
    });
    expect(database.approveEmail).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: "new@example.com" },
    }));
    expect(database.createItems).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ userId: "new-user" })]),
    }));
    expect(database.disconnect).toHaveBeenCalledOnce();
  });

  it("rejects a missing target before connecting to the database", async () => {
    await expect(seedPantryItems([])).rejects.toThrow("Usage:");
    expect(database.findUser).not.toHaveBeenCalled();
  });
});
