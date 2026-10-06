import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createPantryItemMock,
    listPantryItemsMock,
    PantryItemConflictErrorMock,
} = vi.hoisted(() => {
    class PantryItemConflictErrorMock extends Error {}

    return {
        createPantryItemMock: vi.fn(),
        listPantryItemsMock: vi.fn(),
        PantryItemConflictErrorMock,
    }
})

vi.mock('@/services/pantry-item-service', () => ({
    createPantryItem: createPantryItemMock,
    listPantryItems: listPantryItemsMock,
    PantryItemConflictError: PantryItemConflictErrorMock,
}))

import { GET, POST } from '@/app/api/pantry-items/route'

const userId = 'dev-user'
const pantryItem = {
    id: 'cm12345678901234567890123',
    name: 'Olive Oil',
    quantity: '1/2',
    unit: 'bottle',
    createdAt: '2026-09-28T12:00:00.000Z',
    updatedAt: '2026-09-28T12:00:00.000Z',
}

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('GET /api/pantry-items', () => {
    it.each([
        ['an empty pantry', []],
        ['a populated pantry', [pantryItem]],
    ])('returns %s', async (_case, items) => {
        listPantryItemsMock.mockResolvedValue(items)

        const response = await GET()

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ items })
        expect(listPantryItemsMock).toHaveBeenCalledOnce()
    })

    it('returns a generic error without leaking list failures', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        listPantryItemsMock.mockRejectedValue(new Error('database credentials'))

        const response = await GET()

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({
            error: 'Internal Server Error',
        })
    })
})

describe('POST /api/pantry-items', () => {
    it('normalizes and creates an item with a textual quantity', async () => {
        createPantryItemMock.mockResolvedValue(pantryItem)
        const request = new Request('http://localhost:3000/api/pantry-items', {
            method: 'POST',
            body: JSON.stringify({
                name: '  Olive\t Oil ',
                quantity: ' 1/2 ',
                unit: ' bottle ',
                normalizedName: 'not accepted from clients',
            }),
        })

        const response = await POST(request)

        expect(response.status).toBe(201)
        await expect(response.json()).resolves.toEqual(pantryItem)
        expect(createPantryItemMock).toHaveBeenCalledWith(userId, {
            name: 'Olive Oil',
            quantity: '1/2',
            unit: 'bottle',
        })
    })

    it('accepts blank optional fields and normalizes them to undefined', async () => {
        createPantryItemMock.mockResolvedValue({
            ...pantryItem,
            quantity: null,
            unit: null,
        })
        const request = new Request('http://localhost:3000/api/pantry-items', {
            method: 'POST',
            body: JSON.stringify({
                name: 'Salt',
                quantity: '   ',
                unit: '',
            }),
        })

        const response = await POST(request)

        expect(response.status).toBe(201)
        expect(createPantryItemMock).toHaveBeenCalledWith(userId, {
            name: 'Salt',
            quantity: undefined,
            unit: undefined,
        })
    })

    it.each([
        ['a blank name', { name: '   ' }],
        ['a numeric quantity', { name: 'Salt', quantity: 2 }],
        ['a non-string unit', { name: 'Salt', unit: false }],
    ])('returns 400 for %s', async (_case, input) => {
        const request = new Request('http://localhost:3000/api/pantry-items', {
            method: 'POST',
            body: JSON.stringify(input),
        })

        const response = await POST(request)

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            error: 'Invalid pantry item',
        })
        expect(createPantryItemMock).not.toHaveBeenCalled()
    })

    it('returns 400 for malformed JSON', async () => {
        const request = new Request('http://localhost:3000/api/pantry-items', {
            method: 'POST',
            body: '{',
        })

        const response = await POST(request)

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({ error: 'Malformed JSON' })
        expect(createPantryItemMock).not.toHaveBeenCalled()
    })

    it('returns 409 for an equivalent normalized name', async () => {
        createPantryItemMock.mockRejectedValue(new PantryItemConflictErrorMock())
        const request = new Request('http://localhost:3000/api/pantry-items', {
            method: 'POST',
            body: JSON.stringify({ name: 'Olive Oil' }),
        })

        const response = await POST(request)

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toEqual({
            error: 'Pantry item already exists',
        })
    })

    it('returns a generic 500 without exposing create failures', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        createPantryItemMock.mockRejectedValue(new Error('unique index internals'))
        const request = new Request('http://localhost:3000/api/pantry-items', {
            method: 'POST',
            body: JSON.stringify({ name: 'Salt' }),
        })

        const response = await POST(request)

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({
            error: 'Internal Server Error',
        })
    })
})
