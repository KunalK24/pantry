import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
    getActiveGroceryListMock,
    saveActiveGroceryListMock,
    clearActiveGroceryListMock,
    GroceryListReferenceErrorMock,
} = vi.hoisted(() => {
    class GroceryListReferenceErrorMock extends Error {}

    return {
        getActiveGroceryListMock: vi.fn(),
        saveActiveGroceryListMock: vi.fn(),
        clearActiveGroceryListMock: vi.fn(),
        GroceryListReferenceErrorMock,
    }
})

vi.mock('@/services/grocery-list-service', () => ({
    getActiveGroceryList: getActiveGroceryListMock,
    saveActiveGroceryList: saveActiveGroceryListMock,
    clearActiveGroceryList: clearActiveGroceryListMock,
    GroceryListReferenceError: GroceryListReferenceErrorMock,
}))

import { DELETE, GET, PUT } from '@/app/api/grocery-list/route'

const recipeId = 'cm12345678901234567890123'
const pantryItemId = 'cm22345678901234567890123'
const input = {
    importedWeeklyPlanId: null,
    recipes: [
        { recipeId, source: 'MANUAL' },
        { recipeId, source: 'WEEKLY_PLAN' },
        { recipeId, source: 'WEEKLY_PLAN' },
    ],
    items: [{
        lineKey: 'computed:["egg",""]',
        name: 'Egg',
        baseQuantity: '5',
        baseUnit: '',
        quantityOverride: null,
        unitOverride: null,
        checked: true,
        dismissed: false,
        pantryItemId,
    }],
}
const list = {
    id: 'cm32345678901234567890123',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...input,
}

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('GET /api/grocery-list', () => {
    it.each([
        ['an absent list', null],
        ['the active list', list],
    ])('returns %s', async (_case, activeList) => {
        getActiveGroceryListMock.mockResolvedValue(activeList)

        const response = await GET()

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ list: activeList })
    })

    it('does not expose load errors', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        getActiveGroceryListMock.mockRejectedValue(new Error('database internals'))

        const response = await GET()

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' })
    })
})

describe('PUT /api/grocery-list', () => {
    it('allows duplicate recipe occurrences and saves the snapshot', async () => {
        saveActiveGroceryListMock.mockResolvedValue(list)
        const request = new Request('http://localhost', {
            method: 'PUT',
            body: JSON.stringify(input),
        })

        const response = await PUT(request)

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ list })
        expect(saveActiveGroceryListMock).toHaveBeenCalledWith(input)
    })

    it('accepts an empty base quantity for a manual pantry line', async () => {
        const manualPantryInput = {
            ...input,
            items: [{
                ...input.items[0],
                baseQuantity: '',
            }],
        }
        saveActiveGroceryListMock.mockResolvedValue({
            ...list,
            items: manualPantryInput.items,
        })
        const request = new Request('http://localhost', {
            method: 'PUT',
            body: JSON.stringify(manualPantryInput),
        })

        const response = await PUT(request)

        expect(response.status).toBe(200)
        expect(saveActiveGroceryListMock).toHaveBeenCalledWith(manualPantryInput)
    })

    it.each([
        ['an invalid recipe ID', { ...input, recipes: [{ recipeId: 'bad', source: 'MANUAL' }] }],
        ['an invalid source', { ...input, recipes: [{ recipeId, source: 'OTHER' }] }],
        ['a blank item name', { ...input, items: [{ ...input.items[0], name: '  ' }] }],
        ['duplicate line keys', { ...input, items: [input.items[0], input.items[0]] }],
    ])('returns 400 for %s', async (_case, invalidInput) => {
        const request = new Request('http://localhost', {
            method: 'PUT',
            body: JSON.stringify(invalidInput),
        })

        const response = await PUT(request)

        expect(response.status).toBe(400)
        expect(saveActiveGroceryListMock).not.toHaveBeenCalled()
    })

    it('returns 400 for malformed JSON', async () => {
        const response = await PUT(new Request('http://localhost', {
            method: 'PUT',
            body: '{',
        }))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({ error: 'Malformed JSON' })
    })

    it('returns a safe 400 for an unknown reference', async () => {
        saveActiveGroceryListMock.mockRejectedValue(new GroceryListReferenceErrorMock())
        const request = new Request('http://localhost', {
            method: 'PUT',
            body: JSON.stringify(input),
        })

        const response = await PUT(request)

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({
            error: 'Grocery list references an unknown record',
        })
    })

    it('does not expose unexpected save errors', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        saveActiveGroceryListMock.mockRejectedValue(new Error('database internals'))
        const request = new Request('http://localhost', {
            method: 'PUT',
            body: JSON.stringify(input),
        })

        const response = await PUT(request)

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' })
    })
})

describe('DELETE /api/grocery-list', () => {
    it('returns 204 when the list is absent or deleted', async () => {
        clearActiveGroceryListMock.mockResolvedValue(undefined)

        const response = await DELETE()

        expect(response.status).toBe(204)
        expect(await response.text()).toBe('')
    })

    it('does not expose delete errors', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        clearActiveGroceryListMock.mockRejectedValue(new Error('database internals'))

        const response = await DELETE()

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' })
    })
})
