import { beforeEach, describe, expect, it, vi } from 'vitest'

const { importRecipeMock, MockRecipeImportError } = vi.hoisted(() => {
    class MockRecipeImportError extends Error {
        constructor(public readonly code: string) {
            super(code)
        }
    }

    return {
        importRecipeMock: vi.fn(),
        MockRecipeImportError,
    }
})

vi.mock('@/services/recipe-import-service', () => ({
    importRecipe: importRecipeMock,
    RecipeImportError: MockRecipeImportError,
}))

import { POST } from '@/app/api/recipes/parse/route'

function createRequest(body: string) {
    return new Request('http://localhost:3000/api/recipes/parse', {
        method: 'POST',
        body,
    })
}

beforeEach(() => {
    importRecipeMock.mockReset()
})

describe('POST /api/recipes/parse', () => {
    it('returns a parsed recipe draft without persisting it', async () => {
        const draft = {
            name: 'Toast',
            instructions: 'Toast the bread.',
            ingredients: [{ name: 'Bread', quantity: '2', unit: 'slices' }],
        }
        importRecipeMock.mockResolvedValue(draft)

        const response = await POST(createRequest(JSON.stringify({ text: 'Toast recipe' })))

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ draft })
        expect(importRecipeMock).toHaveBeenCalledWith({ text: 'Toast recipe' })
    })

    it('returns 400 for malformed JSON', async () => {
        const response = await POST(createRequest('{'))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({ error: 'Malformed JSON' })
        expect(importRecipeMock).not.toHaveBeenCalled()
    })

    it.each([
        ['a missing text field', {}],
        ['blank text', { text: '   ' }],
        ['a non-string text field', { text: 42 }],
        ['text over the size limit', { text: 'a'.repeat(20_001) }],
    ])('returns 400 for %s', async (_case, body) => {
        const response = await POST(createRequest(JSON.stringify(body)))

        expect(response.status).toBe(400)
        expect(importRecipeMock).not.toHaveBeenCalled()
    })

    it('accepts text at the size limit and passes trimmed input to the service', async () => {
        const draft = {
            name: 'Toast',
            instructions: 'Toast the bread.',
            ingredients: [{ name: 'Bread', quantity: '1', unit: 'slice' }],
        }
        const textAtLimit = 'a'.repeat(20_000)
        importRecipeMock.mockResolvedValue(draft)

        const response = await POST(createRequest(JSON.stringify({
            text: `  ${textAtLimit}\n`,
        })))

        expect(response.status).toBe(200)
        expect(importRecipeMock).toHaveBeenCalledWith({ text: textAtLimit })
    })

    it.each([
        ['invalid_extraction', 422, 'The pasted text could not be converted into a valid recipe'],
        ['rate_limited', 429, 'Recipe import is temporarily rate limited'],
        ['not_configured', 503, 'Recipe import is not configured'],
        ['provider_failure', 502, 'Recipe import provider is unavailable'],
        ['timeout', 504, 'Recipe import provider timed out'],
    ])('maps %s failures to %i', async (code, status, message) => {
        importRecipeMock.mockRejectedValue(new MockRecipeImportError(code))

        const response = await POST(createRequest(JSON.stringify({ text: 'Recipe text' })))

        expect(response.status).toBe(status)
        await expect(response.json()).resolves.toEqual({ error: message })
    })

    it('returns a generic 500 for unexpected failures', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        importRecipeMock.mockRejectedValue(new Error('sensitive internal details'))

        const response = await POST(createRequest(JSON.stringify({ text: 'Recipe text' })))

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' })
    })
})
