import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createPantryItemMock,
    findManyPantryItemsMock,
    findPantryItemByIdMock,
    updatePantryItemMock,
} = vi.hoisted(() => ({
    createPantryItemMock: vi.fn(),
    findManyPantryItemsMock: vi.fn(),
    findPantryItemByIdMock: vi.fn(),
    updatePantryItemMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        pantryItem: {
            create: createPantryItemMock,
            findMany: findManyPantryItemsMock,
            findUnique: findPantryItemByIdMock,
            update: updatePantryItemMock,
        },
    },
}))

import { Prisma } from '@/generated/prisma/client'
import {
    normalizePantryItemName,
    pantryItemInputSchema,
} from '@/schemas/pantry-item'
import {
    createPantryItem,
    getPantryItemById,
    listPantryItems,
    PantryItemConflictError,
    PantryItemNotFoundError,
    updatePantryItem,
} from '@/services/pantry-item-service'

const pantryItemSelect = {
    id: true,
    name: true,
    quantity: true,
    unit: true,
    createdAt: true,
    updatedAt: true,
}

const pantryItemId = 'cm12345678901234567890123'
const pantryItem = {
    id: pantryItemId,
    name: 'Olive Oil',
    quantity: '1/2',
    unit: 'bottle',
    createdAt: new Date('2026-09-28T12:00:00.000Z'),
    updatedAt: new Date('2026-09-28T12:00:00.000Z'),
}

function knownPrismaError(code: string) {
    return new Prisma.PrismaClientKnownRequestError('Database operation failed', {
        code,
        clientVersion: '7.10.0',
    })
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('pantry item validation and normalization', () => {
    it('normalizes display whitespace and strips unknown fields', () => {
        expect(pantryItemInputSchema.parse({
            name: '  Olive\t  Oil\n',
            quantity: '  1/2  ',
            unit: ' bottle ',
            normalizedName: 'client-controlled',
        })).toEqual({
            name: 'Olive Oil',
            quantity: '1/2',
            unit: 'bottle',
        })

        expect(normalizePantryItemName('  OLIVE\t Oil ')).toBe('olive oil')
    })

    it('normalizes blank optional fields to undefined', () => {
        expect(pantryItemInputSchema.parse({
            name: 'Salt',
            quantity: '   ',
            unit: '',
        })).toEqual({
            name: 'Salt',
            quantity: undefined,
            unit: undefined,
        })
    })

    it('does not apply synonym or semantic normalization', () => {
        expect(normalizePantryItemName('Scallion')).toBe('scallion')
        expect(normalizePantryItemName('Green Onion')).toBe('green onion')
        expect(normalizePantryItemName('green-onion')).toBe('green-onion')
    })
})

describe('listPantryItems', () => {
    it('returns public fields ordered by normalized name', async () => {
        findManyPantryItemsMock.mockResolvedValue([pantryItem])

        await expect(listPantryItems()).resolves.toEqual([pantryItem])
        expect(findManyPantryItemsMock).toHaveBeenCalledWith({
            orderBy: {
                normalizedName: 'asc',
            },
            select: pantryItemSelect,
        })
    })
})

describe('createPantryItem', () => {
    it('creates an item with a normalized name and textual quantity', async () => {
        createPantryItemMock.mockResolvedValue(pantryItem)

        await expect(createPantryItem({
            name: 'Olive Oil',
            quantity: '1/2',
            unit: 'bottle',
        })).resolves.toEqual(pantryItem)

        expect(createPantryItemMock).toHaveBeenCalledWith({
            data: {
                name: 'Olive Oil',
                normalizedName: 'olive oil',
                quantity: '1/2',
                unit: 'bottle',
            },
            select: pantryItemSelect,
        })
    })

    it('persists omitted optional fields as null', async () => {
        createPantryItemMock.mockResolvedValue({
            ...pantryItem,
            quantity: null,
            unit: null,
        })

        await createPantryItem({ name: 'Salt' })

        expect(createPantryItemMock).toHaveBeenCalledWith({
            data: {
                name: 'Salt',
                normalizedName: 'salt',
                quantity: null,
                unit: null,
            },
            select: pantryItemSelect,
        })
    })

    it('translates duplicate-name races to a conflict error', async () => {
        createPantryItemMock.mockRejectedValue(knownPrismaError('P2002'))

        await expect(createPantryItem({ name: 'Olive Oil' }))
            .rejects.toBeInstanceOf(PantryItemConflictError)
    })

    it('propagates unrelated create failures unchanged', async () => {
        const error = knownPrismaError('P2003')
        createPantryItemMock.mockRejectedValue(error)

        await expect(createPantryItem({ name: 'Olive Oil' })).rejects.toBe(error)
    })

    it('does not translate a create P2025 into a not-found domain error', async () => {
        const error = knownPrismaError('P2025')
        createPantryItemMock.mockRejectedValue(error)

        await expect(createPantryItem({ name: 'Olive Oil' })).rejects.toBe(error)
    })
})

describe('getPantryItemById', () => {
    it('returns a pantry item without its normalized name', async () => {
        findPantryItemByIdMock.mockResolvedValue(pantryItem)

        await expect(getPantryItemById(pantryItemId)).resolves.toEqual(pantryItem)
        expect(findPantryItemByIdMock).toHaveBeenCalledWith({
            where: {
                id: pantryItemId,
            },
            select: pantryItemSelect,
        })
    })

    it('throws a domain error when the item does not exist', async () => {
        findPantryItemByIdMock.mockResolvedValue(null)

        await expect(getPantryItemById(pantryItemId))
            .rejects.toBeInstanceOf(PantryItemNotFoundError)
    })
})

describe('updatePantryItem', () => {
    it('updates every editable field and its normalized name', async () => {
        const updatedItem = {
            ...pantryItem,
            name: 'Extra Virgin Olive Oil',
            quantity: 'one large',
            unit: 'bottle',
        }
        updatePantryItemMock.mockResolvedValue(updatedItem)

        await expect(updatePantryItem(pantryItemId, {
            name: 'Extra Virgin Olive Oil',
            quantity: 'one large',
            unit: 'bottle',
        })).resolves.toEqual(updatedItem)

        expect(updatePantryItemMock).toHaveBeenCalledWith({
            where: {
                id: pantryItemId,
            },
            data: {
                name: 'Extra Virgin Olive Oil',
                normalizedName: 'extra virgin olive oil',
                quantity: 'one large',
                unit: 'bottle',
            },
            select: pantryItemSelect,
        })
    })

    it('clears optional fields with null values', async () => {
        updatePantryItemMock.mockResolvedValue({
            ...pantryItem,
            quantity: null,
            unit: null,
        })

        await updatePantryItem(pantryItemId, { name: 'Olive Oil' })

        expect(updatePantryItemMock).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                quantity: null,
                unit: null,
            }),
        }))
    })

    it('translates a missing-record race to a not-found error', async () => {
        updatePantryItemMock.mockRejectedValue(knownPrismaError('P2025'))

        await expect(updatePantryItem(pantryItemId, { name: 'Olive Oil' }))
            .rejects.toBeInstanceOf(PantryItemNotFoundError)
    })

    it('translates a duplicate rename to a conflict error', async () => {
        updatePantryItemMock.mockRejectedValue(knownPrismaError('P2002'))

        await expect(updatePantryItem(pantryItemId, { name: 'Avocado Oil' }))
            .rejects.toBeInstanceOf(PantryItemConflictError)
    })

    it('propagates unrelated update failures unchanged', async () => {
        const error = new Error('connection closed')
        updatePantryItemMock.mockRejectedValue(error)

        await expect(updatePantryItem(pantryItemId, { name: 'Olive Oil' }))
            .rejects.toBe(error)
    })
})
