import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
    deletePantryItemMock,
    getPantryItemByIdMock,
    updatePantryItemMock,
    PantryItemConflictErrorMock,
    PantryItemNotFoundErrorMock,
    requireAuthMock,
} = vi.hoisted(() => {
    class PantryItemConflictErrorMock extends Error {}
    class PantryItemNotFoundErrorMock extends Error {}

    return {
        deletePantryItemMock: vi.fn(),
        getPantryItemByIdMock: vi.fn(),
        updatePantryItemMock: vi.fn(),
        PantryItemConflictErrorMock,
        PantryItemNotFoundErrorMock,
        requireAuthMock: vi.fn(),
    }
})

vi.mock('@/services/pantry-item-service', () => ({
    deletePantryItem: deletePantryItemMock,
    getPantryItemById: getPantryItemByIdMock,
    updatePantryItem: updatePantryItemMock,
    PantryItemConflictError: PantryItemConflictErrorMock,
    PantryItemNotFoundError: PantryItemNotFoundErrorMock,
}))

vi.mock('@/lib/auth', () => ({
    requireAuth: requireAuthMock,
}))

import { DELETE, GET, PUT } from '@/app/api/pantry-items/[id]/route'

const pantryItemId = 'cm12345678901234567890123'
const userId = 'auth-user'
const authUser = { id: userId, email: 'cook@example.com' }
const context = (id = pantryItemId) => ({ params: Promise.resolve({ id }) })
const pantryItem = {
    id: pantryItemId,
    name: 'Olive Oil',
    quantity: '1/2',
    unit: 'bottle',
    createdAt: '2026-09-28T12:00:00.000Z',
    updatedAt: '2026-09-28T12:00:00.000Z',
}

beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue({ user: authUser, response: null })
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('GET /api/pantry-items/[id]', () => {
    it('returns a complete pantry item', async () => {
        getPantryItemByIdMock.mockResolvedValue(pantryItem)

        const response = await GET(
            new Request(`http://localhost:3000/api/pantry-items/${pantryItemId}`),
            context(),
        )

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual(pantryItem)
        expect(getPantryItemByIdMock).toHaveBeenCalledWith(userId, pantryItemId)
    })

    it('returns 400 for a malformed pantry item ID', async () => {
        const response = await GET(
            new Request('http://localhost:3000/api/pantry-items/not-a-cuid'),
            context('not-a-cuid'),
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({
            error: 'Invalid pantry item ID',
        })
        expect(getPantryItemByIdMock).not.toHaveBeenCalled()
    })

    it('returns 404 when the pantry item is missing', async () => {
        getPantryItemByIdMock.mockRejectedValue(new PantryItemNotFoundErrorMock())

        const response = await GET(
            new Request(`http://localhost:3000/api/pantry-items/${pantryItemId}`),
            context(),
        )

        expect(response.status).toBe(404)
        await expect(response.json()).resolves.toEqual({
            error: 'Pantry item not found',
        })
    })

    it('returns a generic 500 without exposing lookup failures', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        getPantryItemByIdMock.mockRejectedValue(new Error('database details'))

        const response = await GET(
            new Request(`http://localhost:3000/api/pantry-items/${pantryItemId}`),
            context(),
        )

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({
            error: 'Internal Server Error',
        })
    })

    it('returns 401 when unauthenticated', async () => {
        requireAuthMock.mockResolvedValue({
            user: null,
            response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
        })

        const response = await GET(
            new Request(`http://localhost:3000/api/pantry-items/${pantryItemId}`),
            context(),
        )

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
        expect(getPantryItemByIdMock).not.toHaveBeenCalled()
    })
})

describe('PUT /api/pantry-items/[id]', () => {
    it('fully updates and normalizes a pantry item', async () => {
        updatePantryItemMock.mockResolvedValue(pantryItem)
        const request = new Request(
            `http://localhost:3000/api/pantry-items/${pantryItemId}`,
            {
                method: 'PUT',
                body: JSON.stringify({
                    name: ' Olive\t Oil ',
                    quantity: ' 1/2 ',
                    unit: ' bottle ',
                    normalizedName: 'ignored',
                }),
            },
        )

        const response = await PUT(request, context())

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual(pantryItem)
        expect(updatePantryItemMock).toHaveBeenCalledWith(userId, pantryItemId, {
            name: 'Olive Oil',
            quantity: '1/2',
            unit: 'bottle',
        })
    })

    it('allows blank optional fields to clear existing values', async () => {
        updatePantryItemMock.mockResolvedValue({
            ...pantryItem,
            quantity: null,
            unit: null,
        })
        const request = new Request(
            `http://localhost:3000/api/pantry-items/${pantryItemId}`,
            {
                method: 'PUT',
                body: JSON.stringify({
                    name: 'Olive Oil',
                    quantity: ' ',
                    unit: '',
                }),
            },
        )

        const response = await PUT(request, context())

        expect(response.status).toBe(200)
        expect(updatePantryItemMock).toHaveBeenCalledWith(userId, pantryItemId, {
            name: 'Olive Oil',
            quantity: undefined,
            unit: undefined,
        })
    })

    it('returns 400 for a malformed ID before reading the body', async () => {
        const request = new Request('http://localhost:3000/api/pantry-items/invalid', {
            method: 'PUT',
            body: '{',
        })

        const response = await PUT(request, context('invalid'))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({
            error: 'Invalid pantry item ID',
        })
        expect(updatePantryItemMock).not.toHaveBeenCalled()
    })

    it('returns 400 for malformed JSON', async () => {
        const request = new Request(
            `http://localhost:3000/api/pantry-items/${pantryItemId}`,
            {
                method: 'PUT',
                body: '{',
            },
        )

        const response = await PUT(request, context())

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({ error: 'Malformed JSON' })
        expect(updatePantryItemMock).not.toHaveBeenCalled()
    })

    it.each([
        ['a blank name', { name: '   ' }],
        ['a numeric quantity', { name: 'Salt', quantity: 2 }],
        ['a non-string unit', { name: 'Salt', unit: false }],
    ])('returns 400 for %s', async (_case, input) => {
        const request = new Request(
            `http://localhost:3000/api/pantry-items/${pantryItemId}`,
            {
                method: 'PUT',
                body: JSON.stringify(input),
            },
        )

        const response = await PUT(request, context())

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            error: 'Invalid pantry item',
        })
        expect(updatePantryItemMock).not.toHaveBeenCalled()
    })

    it('returns 404 when the item disappears during update', async () => {
        updatePantryItemMock.mockRejectedValue(new PantryItemNotFoundErrorMock())
        const request = new Request(
            `http://localhost:3000/api/pantry-items/${pantryItemId}`,
            {
                method: 'PUT',
                body: JSON.stringify({ name: 'Olive Oil' }),
            },
        )

        const response = await PUT(request, context())

        expect(response.status).toBe(404)
        await expect(response.json()).resolves.toEqual({
            error: 'Pantry item not found',
        })
    })

    it('returns 409 when the renamed item conflicts', async () => {
        updatePantryItemMock.mockRejectedValue(new PantryItemConflictErrorMock())
        const request = new Request(
            `http://localhost:3000/api/pantry-items/${pantryItemId}`,
            {
                method: 'PUT',
                body: JSON.stringify({ name: 'Avocado Oil' }),
            },
        )

        const response = await PUT(request, context())

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toEqual({
            error: 'Pantry item already exists',
        })
    })

    it('returns a generic 500 without exposing update failures', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        updatePantryItemMock.mockRejectedValue(new Error('constraint details'))
        const request = new Request(
            `http://localhost:3000/api/pantry-items/${pantryItemId}`,
            {
                method: 'PUT',
                body: JSON.stringify({ name: 'Olive Oil' }),
            },
        )

        const response = await PUT(request, context())

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({
            error: 'Internal Server Error',
        })
    })
})

describe('DELETE /api/pantry-items/[id]', () => {
    it('deletes and returns the pantry item', async () => {
        deletePantryItemMock.mockResolvedValue(pantryItem)

        const response = await DELETE(
            new Request(`http://localhost:3000/api/pantry-items/${pantryItemId}`, {
                method: 'DELETE',
            }),
            context(),
        )

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual(pantryItem)
        expect(deletePantryItemMock).toHaveBeenCalledOnce()
        expect(deletePantryItemMock).toHaveBeenCalledWith(userId, pantryItemId)
    })

    it('returns 400 for a malformed pantry item ID', async () => {
        const response = await DELETE(
            new Request('http://localhost:3000/api/pantry-items/not-a-cuid', {
                method: 'DELETE',
            }),
            context('not-a-cuid'),
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({
            error: 'Invalid pantry item ID',
        })
        expect(deletePantryItemMock).not.toHaveBeenCalled()
    })

    it('returns 404 when the pantry item is missing', async () => {
        deletePantryItemMock.mockRejectedValue(new PantryItemNotFoundErrorMock())

        const response = await DELETE(
            new Request(`http://localhost:3000/api/pantry-items/${pantryItemId}`, {
                method: 'DELETE',
            }),
            context(),
        )

        expect(response.status).toBe(404)
        await expect(response.json()).resolves.toEqual({
            error: 'Pantry item not found',
        })
    })

    it('returns a generic 500 without exposing deletion failures', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        deletePantryItemMock.mockRejectedValue(new Error('database details'))

        const response = await DELETE(
            new Request(`http://localhost:3000/api/pantry-items/${pantryItemId}`, {
                method: 'DELETE',
            }),
            context(),
        )

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({
            error: 'Internal Server Error',
        })
    })
})
