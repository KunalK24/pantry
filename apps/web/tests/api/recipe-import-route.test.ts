import { beforeEach, describe, expect, it, vi } from 'vitest'

const { importRecipeMock, MockRecipeImportError, requireAuthMock } = vi.hoisted(() => {
    class MockRecipeImportError extends Error {
        constructor(public readonly code: string) {
            super(code)
        }
    }

    return {
        importRecipeMock: vi.fn(),
        MockRecipeImportError,
        requireAuthMock: vi.fn(),
    }
})

vi.mock('@/services/recipe-import-service', () => ({
    importRecipe: importRecipeMock,
    RecipeImportError: MockRecipeImportError,
}))

vi.mock('@/lib/auth', () => ({
    requireAuth: requireAuthMock,
}))

import { POST } from '@/app/api/recipes/parse/route'

const authUser = { id: 'auth-user', email: 'cook@example.com' }

function createRequest(body: string) {
    return new Request('http://localhost:3000/api/recipes/parse', {
        method: 'POST',
        body,
    })
}

beforeEach(() => {
    importRecipeMock.mockReset()
    requireAuthMock.mockReset()
    requireAuthMock.mockResolvedValue({ user: authUser, response: null })
})

describe('POST /api/recipes/parse', () => {
    it('returns a parsed recipe draft without persisting it', async () => {
        const draft = {
            name: 'Toast',
            instructions: 'Toast the bread.',
            ingredients: [{ name: 'Bread', quantity: '2', unit: 'slices' }],
        }
        importRecipeMock.mockResolvedValue(draft)

        const response = await POST(createRequest(JSON.stringify({
            type: 'text',
            text: 'Toast recipe',
        })))

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ draft })
        expect(importRecipeMock).toHaveBeenCalledWith({
            type: 'text',
            text: 'Toast recipe',
        })
    })

    it('preserves legacy text-only import requests', async () => {
        const draft = {
            name: 'Toast',
            instructions: 'Toast the bread.',
            ingredients: [{ name: 'Bread', quantity: '2', unit: 'slices' }],
        }
        importRecipeMock.mockResolvedValue(draft)

        const response = await POST(createRequest(JSON.stringify({ text: 'Toast recipe' })))

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ draft })
        expect(importRecipeMock).toHaveBeenCalledWith({
            type: 'text',
            text: 'Toast recipe',
        })
    })

    it('accepts valid image import requests', async () => {
        const draft = {
            name: 'Toast',
            instructions: 'Toast the bread.',
            ingredients: [{ name: 'Bread', quantity: '2', unit: 'slices' }],
        }
        importRecipeMock.mockResolvedValue(draft)
        const image = {
            mimeType: 'image/webp',
            data: Buffer.from('image').toString('base64'),
        }

        const response = await POST(createRequest(JSON.stringify({
            type: 'image',
            image,
        })))

        expect(response.status).toBe(200)
        expect(importRecipeMock).toHaveBeenCalledWith({
            type: 'image',
            image,
        })
    })

    it('accepts valid URL import requests', async () => {
        const draft = {
            name: 'Toast',
            instructions: 'Toast the bread.',
            ingredients: [{ name: 'Bread', quantity: '2', unit: 'slices' }],
        }
        importRecipeMock.mockResolvedValue(draft)

        const response = await POST(createRequest(JSON.stringify({
            type: 'url',
            url: 'https://example.com/recipe',
        })))

        expect(response.status).toBe(200)
        expect(importRecipeMock).toHaveBeenCalledWith({
            type: 'url',
            url: 'https://example.com/recipe',
        })
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
        ['an unknown import type', { type: 'pdf', text: 'Recipe text' }],
        ['unsupported image MIME type', {
            type: 'image',
            image: {
                mimeType: 'image/gif',
                data: Buffer.from('image').toString('base64'),
            },
        }],
        ['missing image data', {
            type: 'image',
            image: {
                mimeType: 'image/png',
                data: '',
            },
        }],
        ['a non-http URL', { type: 'url', url: 'ftp://example.com/recipe' }],
        ['an invalid URL', { type: 'url', url: 'not a url' }],
        ['a URL over the size limit', {
            type: 'url',
            url: `https://example.com/${'a'.repeat(2049)}`,
        }],
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
        expect(importRecipeMock).toHaveBeenCalledWith({
            type: 'text',
            text: textAtLimit,
        })
    })

    it.each([
        ['invalid_extraction', 422, 'The recipe source could not be converted into a valid recipe'],
        ['invalid_source', 400, 'Invalid recipe import source'],
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

    it('returns 401 when unauthenticated', async () => {
        requireAuthMock.mockResolvedValue({
            user: null,
            response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
        })

        const response = await POST(createRequest(JSON.stringify({ text: 'Recipe text' })))

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
        expect(importRecipeMock).not.toHaveBeenCalled()
    })
})
