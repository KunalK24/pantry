import { Prisma } from "@/generated/prisma/client";
import { parseIngredientDetails } from "@/lib/ingredient-normalization";
import { prisma } from "@/lib/prisma";
import { type PantryItemInput } from "@/schemas/pantry-item";

const pantryItemPublicSelect = {
  id: true,
  name: true,
  normalizedName: true,
  quantity: true,
  unit: true,
  brand: true,
  modifiers: true,
  packageQuantity: true,
  packageUnit: true,
  location: true,
  expiresOn: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class PantryItemConflictError extends Error {
  constructor(name: string) {
    super(`A pantry item named ${name} already exists`);
    this.name = "PantryItemConflictError";
  }
}

export class PantryItemNotFoundError extends Error {
  constructor(id: string) {
    super(`Pantry item ${id} was not found`);
    this.name = "PantryItemNotFoundError";
  }
}

function pantryItemData(input: PantryItemInput) {
  const parsed = parseIngredientDetails(input.name, input);
  return {
    name: input.name,
    normalizedName: parsed.normalizedName,
    quantity: parsed.quantity,
    unit: parsed.unit,
    brand: parsed.brand,
    modifiers: parsed.modifiers,
    packageQuantity: parsed.packageQuantity,
    packageUnit: parsed.packageUnit,
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.expiresOn !== undefined
      ? { expiresOn: input.expiresOn ? new Date(`${input.expiresOn}T00:00:00.000Z`) : null }
      : {}),
  };
}

type PantryItemRecord = {
  id: string;
  name: string;
  normalizedName: string;
  quantity: string | null;
  unit: string | null;
  brand: string | null;
  modifiers: string[];
  packageQuantity: string | null;
  packageUnit: string | null;
  location: string | null;
  expiresOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function serializePantryItem(item: PantryItemRecord) {
  return {
    ...item,
    expiresOn: item.expiresOn?.toISOString().slice(0, 10) ?? null,
  };
}

function isKnownPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

export async function listPantryItems(userId: string) {
  const items = await prisma.pantryItem.findMany({
    where: {
      userId,
    },
    orderBy: {
      normalizedName: "asc",
    },
    select: pantryItemPublicSelect,
  });

  return items.map(serializePantryItem);
}

export async function createPantryItem(userId: string, input: PantryItemInput) {
  const item = await prisma.pantryItem.create({
    data: {
      userId,
      ...pantryItemData(input),
      location: input.location ?? null,
      expiresOn: input.expiresOn ? new Date(`${input.expiresOn}T00:00:00.000Z`) : null,
    },
    select: pantryItemPublicSelect,
  });

  return serializePantryItem(item);
}

export async function getPantryItemById(userId: string, id: string) {
  const item = await prisma.pantryItem.findUnique({
    where: {
      id,
      userId,
    },
    select: pantryItemPublicSelect,
  });

  if (!item) {
    throw new PantryItemNotFoundError(id);
  }

  return serializePantryItem(item);
}

export async function updatePantryItem(
  userId: string,
  id: string,
  input: PantryItemInput,
) {
  try {
    const item = await prisma.pantryItem.update({
      where: {
        id,
        userId,
      },
      data: pantryItemData(input),
      select: pantryItemPublicSelect,
    });

    return serializePantryItem(item);
  } catch (error) {
    if (isKnownPrismaError(error, "P2025")) {
      throw new PantryItemNotFoundError(id);
    }

    throw error;
  }
}

export async function deletePantryItem(userId: string, id: string) {
  try {
    const item = await prisma.pantryItem.delete({
      where: {
        id,
        userId,
      },
      select: pantryItemPublicSelect,
    });

    return serializePantryItem(item);
  } catch (error) {
    if (isKnownPrismaError(error, "P2025")) {
      throw new PantryItemNotFoundError(id);
    }

    throw error;
  }
}
