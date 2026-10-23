import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createPantryItemMock,
  deletePantryItemMock,
  findManyPantryItemsMock,
  findPantryItemByIdMock,
  updatePantryItemMock,
} = vi.hoisted(() => ({
  createPantryItemMock: vi.fn(),
  deletePantryItemMock: vi.fn(),
  findManyPantryItemsMock: vi.fn(),
  findPantryItemByIdMock: vi.fn(),
  updatePantryItemMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pantryItem: {
      create: createPantryItemMock,
      delete: deletePantryItemMock,
      findMany: findManyPantryItemsMock,
      findUnique: findPantryItemByIdMock,
      update: updatePantryItemMock,
    },
  },
}));

import { Prisma } from "@/generated/prisma/client";
import { pantryItemInputSchema } from "@/schemas/pantry-item";
import {
  createPantryItem,
  deletePantryItem,
  getPantryItemById,
  listPantryItems,
  PantryItemConflictError,
  PantryItemNotFoundError,
  updatePantryItem,
} from "@/services/pantry-item-service";

const pantryItemSelect = {
  id: true,
  name: true,
  quantity: true,
  unit: true,
  createdAt: true,
  updatedAt: true,
};

const pantryItemId = "cm12345678901234567890123";
const userId = "cm22345678901234567890123";
const pantryItem = {
  id: pantryItemId,
  name: "Olive Oil",
  quantity: "1/2",
  unit: "bottle",
  createdAt: new Date("2026-09-28T12:00:00.000Z"),
  updatedAt: new Date("2026-09-28T12:00:00.000Z"),
};

function knownPrismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("Database operation failed", {
    code,
    clientVersion: "7.10.0",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pantry item validation and normalization", () => {
  it("normalizes display whitespace and strips unknown fields", () => {
    expect(
      pantryItemInputSchema.parse({
        name: "  Olive\t  Oil\n",
        quantity: "  1/2  ",
        unit: " bottle ",
        normalizedName: "client-controlled",
      }),
    ).toEqual({
      name: "Olive Oil",
      quantity: "1/2",
      unit: "bottle",
    });
  });

  it("normalizes blank optional fields to undefined", () => {
    expect(
      pantryItemInputSchema.parse({
        name: "Salt",
        quantity: "   ",
        unit: "",
      }),
    ).toEqual({
      name: "Salt",
      quantity: undefined,
      unit: undefined,
    });
  });
});

describe("listPantryItems", () => {
  it("returns public fields ordered by normalized name", async () => {
    findManyPantryItemsMock.mockResolvedValue([pantryItem]);

    await expect(listPantryItems(userId)).resolves.toEqual([pantryItem]);
    expect(findManyPantryItemsMock).toHaveBeenCalledWith({
      where: {
        userId,
      },
      orderBy: {
        normalizedName: "asc",
      },
      select: pantryItemSelect,
    });
  });
});

describe("createPantryItem", () => {
  it("creates an item with a normalized name and textual quantity", async () => {
    createPantryItemMock.mockResolvedValue(pantryItem);

    await expect(
      createPantryItem(userId, {
        name: "Olive Oil",
        quantity: "1/2",
        unit: "bottle",
      }),
    ).resolves.toEqual(pantryItem);

    expect(createPantryItemMock).toHaveBeenCalledWith({
      data: {
        userId,
        name: "Olive Oil",
        normalizedName: "olive oil",
        quantity: "1/2",
        unit: "bottle",
      },
      select: pantryItemSelect,
    });
  });

  it("persists omitted optional fields as null", async () => {
    createPantryItemMock.mockResolvedValue({
      ...pantryItem,
      quantity: null,
      unit: null,
    });

    await createPantryItem(userId, { name: "Salt" });

    expect(createPantryItemMock).toHaveBeenCalledWith({
      data: {
        userId,
        name: "Salt",
        normalizedName: "salt",
        quantity: null,
        unit: null,
      },
      select: pantryItemSelect,
    });
  });

  it("persists the canonical name while preserving the display name", async () => {
    createPantryItemMock.mockResolvedValue({
      ...pantryItem,
      name: "Scallions",
    });

    await createPantryItem(userId, {
      name: "Scallions",
      quantity: "2",
      unit: "bunches",
    });

    expect(createPantryItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId,
          name: "Scallions",
          normalizedName: "green onion",
          quantity: "2",
          unit: "bunches",
        },
      }),
    );
  });

  it("translates duplicate-name races to a conflict error", async () => {
    createPantryItemMock.mockRejectedValue(knownPrismaError("P2002"));

    await expect(
      createPantryItem(userId, { name: "Olive Oil" }),
    ).rejects.toBeInstanceOf(PantryItemConflictError);
  });

  it("propagates unrelated create failures unchanged", async () => {
    const error = knownPrismaError("P2003");
    createPantryItemMock.mockRejectedValue(error);

    await expect(createPantryItem(userId, { name: "Olive Oil" })).rejects.toBe(
      error,
    );
  });

  it("does not translate a create P2025 into a not-found domain error", async () => {
    const error = knownPrismaError("P2025");
    createPantryItemMock.mockRejectedValue(error);

    await expect(createPantryItem(userId, { name: "Olive Oil" })).rejects.toBe(
      error,
    );
  });
});

describe("getPantryItemById", () => {
  it("returns a pantry item without its normalized name", async () => {
    findPantryItemByIdMock.mockResolvedValue(pantryItem);

    await expect(getPantryItemById(userId, pantryItemId)).resolves.toEqual(
      pantryItem,
    );
    expect(findPantryItemByIdMock).toHaveBeenCalledWith({
      where: {
        id: pantryItemId,
        userId,
      },
      select: pantryItemSelect,
    });
  });

  it("throws a domain error when the item does not exist", async () => {
    findPantryItemByIdMock.mockResolvedValue(null);

    await expect(
      getPantryItemById(userId, pantryItemId),
    ).rejects.toBeInstanceOf(PantryItemNotFoundError);
  });
});

describe("updatePantryItem", () => {
  it("updates every editable field and its normalized name", async () => {
    const updatedItem = {
      ...pantryItem,
      name: "Extra Virgin Olive Oil",
      quantity: "one large",
      unit: "bottle",
    };
    updatePantryItemMock.mockResolvedValue(updatedItem);

    await expect(
      updatePantryItem(userId, pantryItemId, {
        name: "Extra Virgin Olive Oil",
        quantity: "one large",
        unit: "bottle",
      }),
    ).resolves.toEqual(updatedItem);

    expect(updatePantryItemMock).toHaveBeenCalledWith({
      where: {
        id: pantryItemId,
        userId,
      },
      data: {
        name: "Extra Virgin Olive Oil",
        normalizedName: "extra virgin olive oil",
        quantity: "one large",
        unit: "bottle",
      },
      select: pantryItemSelect,
    });
  });

  it("clears optional fields with null values", async () => {
    updatePantryItemMock.mockResolvedValue({
      ...pantryItem,
      quantity: null,
      unit: null,
    });

    await updatePantryItem(userId, pantryItemId, { name: "Olive Oil" });

    expect(updatePantryItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: null,
          unit: null,
        }),
      }),
    );
  });

  it("updates an alias to its canonical name without changing its display name", async () => {
    updatePantryItemMock.mockResolvedValue({ ...pantryItem, name: "Scallion" });

    await updatePantryItem(userId, pantryItemId, { name: "Scallion" });

    expect(updatePantryItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Scallion",
          normalizedName: "green onion",
        }),
      }),
    );
  });

  it("translates a missing-record race to a not-found error", async () => {
    updatePantryItemMock.mockRejectedValue(knownPrismaError("P2025"));

    await expect(
      updatePantryItem(userId, pantryItemId, { name: "Olive Oil" }),
    ).rejects.toBeInstanceOf(PantryItemNotFoundError);
  });

  it("translates a duplicate rename to a conflict error", async () => {
    updatePantryItemMock.mockRejectedValue(knownPrismaError("P2002"));

    await expect(
      updatePantryItem(userId, pantryItemId, { name: "Avocado Oil" }),
    ).rejects.toBeInstanceOf(PantryItemConflictError);
  });

  it("propagates unrelated update failures unchanged", async () => {
    const error = new Error("connection closed");
    updatePantryItemMock.mockRejectedValue(error);

    await expect(
      updatePantryItem(userId, pantryItemId, { name: "Olive Oil" }),
    ).rejects.toBe(error);
  });
});

describe("deletePantryItem", () => {
  it("deletes and returns the pantry item by ID", async () => {
    deletePantryItemMock.mockResolvedValue(pantryItem);

    const deletedItem = await deletePantryItem(userId, pantryItemId);

    expect(deletedItem).toEqual(pantryItem);
    expect(deletedItem).not.toHaveProperty("normalizedName");
    expect(deletePantryItemMock).toHaveBeenCalledOnce();
    expect(deletePantryItemMock).toHaveBeenCalledWith({
      where: {
        id: pantryItemId,
        userId,
      },
      select: pantryItemSelect,
    });
  });

  it("translates a missing-record deletion to a not-found error", async () => {
    deletePantryItemMock.mockRejectedValue(knownPrismaError("P2025"));

    await expect(deletePantryItem(userId, pantryItemId)).rejects.toBeInstanceOf(
      PantryItemNotFoundError,
    );
  });

  it("propagates unrelated deletion failures unchanged", async () => {
    const error = new Error("connection closed");
    deletePantryItemMock.mockRejectedValue(error);

    await expect(deletePantryItem(userId, pantryItemId)).rejects.toBe(error);
  });
});
