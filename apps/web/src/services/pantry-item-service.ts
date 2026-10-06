import { Prisma } from '@/generated/prisma/client'
import { normalizeIngredientName } from '@/lib/ingredient-normalization'
import { prisma } from '@/lib/prisma'
import { type PantryItemInput } from '@/schemas/pantry-item'

const pantryItemPublicSelect = {
    id: true,
    name: true,
    quantity: true,
    unit: true,
    createdAt: true,
    updatedAt: true,
} as const

export class PantryItemConflictError extends Error {
    constructor(name: string) {
        super(`A pantry item named ${name} already exists`)
        this.name = 'PantryItemConflictError'
    }
}

export class PantryItemNotFoundError extends Error {
    constructor(id: string) {
        super(`Pantry item ${id} was not found`)
        this.name = 'PantryItemNotFoundError'
    }
}

function pantryItemData(input: PantryItemInput) {
    return {
        name: input.name,
        normalizedName: normalizeIngredientName(input.name),
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
    }
}

function isKnownPrismaError(error: unknown, code: string) {
    return error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === code
}

export async function listPantryItems(userId: string) {
    return prisma.pantryItem.findMany({
        where: {
            userId,
        },
        orderBy: {
            normalizedName: 'asc',
        },
        select: pantryItemPublicSelect,
    })
}

export async function createPantryItem(userId: string, input: PantryItemInput) {
    try {
        return await prisma.pantryItem.create({
            data: {
                userId,
                ...pantryItemData(input),
            },
            select: pantryItemPublicSelect,
        })
    } catch (error) {
        if (isKnownPrismaError(error, 'P2002')) {
            throw new PantryItemConflictError(input.name)
        }

        throw error
    }
}

export async function getPantryItemById(userId: string, id: string) {
    const item = await prisma.pantryItem.findUnique({
        where: {
            id,
            userId,
        },
        select: pantryItemPublicSelect,
    })

    if (!item) {
        throw new PantryItemNotFoundError(id)
    }

    return item
}

export async function updatePantryItem(userId: string, id: string, input: PantryItemInput) {
    try {
        return await prisma.pantryItem.update({
            where: {
                id,
                userId,
            },
            data: pantryItemData(input),
            select: pantryItemPublicSelect,
        })
    } catch (error) {
        if (isKnownPrismaError(error, 'P2025')) {
            throw new PantryItemNotFoundError(id)
        }

        if (isKnownPrismaError(error, 'P2002')) {
            throw new PantryItemConflictError(input.name)
        }

        throw error
    }
}

export async function deletePantryItem(userId: string, id: string) {
    try {
        return await prisma.pantryItem.delete({
            where: {
                id,
                userId,
            },
            select: pantryItemPublicSelect,
        })
    } catch (error) {
        if (isKnownPrismaError(error, 'P2025')) {
            throw new PantryItemNotFoundError(id)
        }

        throw error
    }
}
