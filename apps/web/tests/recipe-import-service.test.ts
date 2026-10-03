import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createInteractionMock, createClientMock } = vi.hoisted(() => ({
    createInteractionMock: vi.fn(),
    createClientMock: vi.fn(),
}))

vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        interactions = { create: createInteractionMock }

        constructor(options: unknown) {
            createClientMock(options)
        }
    },
}))

import {
    importRecipe,
    RecipeImportError,
} from '@/services/recipe-import-service'

const extractedRecipe = {
    name: 'French Toast',
    description: 'A quick breakfast',
    instructions: 'Whisk, soak, and cook.',
    ingredients: [
        { name: 'Bread', quantity: '2', unit: 'slices' },
        { name: 'Eggs', quantity: '1' },
    ],
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key')
    vi.stubEnv('GEMINI_MODEL', '')
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('importRecipe', () => {
    it('returns a validated recipe draft from structured provider output', async () => {
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify(extractedRecipe),
        })

        await expect(importRecipe({ text: 'French Toast\n2 slices bread' }))
            .resolves.toEqual(extractedRecipe)

        expect(createClientMock).toHaveBeenCalledWith({ apiKey: 'test-api-key' })
        expect(createInteractionMock).toHaveBeenCalledOnce()

        const [request, options] = createInteractionMock.mock.calls[0]
        expect(request).toMatchObject({
            model: 'gemini-3.1-flash-lite',
            input: 'Recipe source text:\nFrench Toast\n2 slices bread',
            store: false,
            response_format: {
                type: 'text',
                mime_type: 'application/json',
            },
        })
        expect(request.input).not.toContain('[object Object]')
        expect(request.system_instruction).toContain('untrusted data')
        expect(request.system_instruction).toContain('unique ingredient names')
        expect(request.response_format.schema.required).toEqual([
            'name',
            'instructions',
            'ingredients',
        ])
        expect(request.response_format.schema.properties.ingredients.items.required)
            .toEqual(['name', 'quantity'])
        expect(options.retries).toEqual({ strategy: 'none' })
        expect(options.signal).toBeInstanceOf(AbortSignal)
    })

    it('uses the configured model', async () => {
        vi.stubEnv('GEMINI_MODEL', 'custom-gemini-model')
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify(extractedRecipe),
        })

        await importRecipe({ text: 'Recipe text' })

        expect(createInteractionMock.mock.calls[0][0].model).toBe('custom-gemini-model')
    })

    it('preserves textual quantities and trims validated fields', async () => {
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify({
                name: ' Seasoning ',
                instructions: ' Mix. ',
                ingredients: [{ name: ' Salt ', quantity: ' to taste ', unit: ' ' }],
            }),
        })

        await expect(importRecipe({ text: 'Seasoning recipe' })).resolves.toEqual({
            name: 'Seasoning',
            instructions: 'Mix.',
            ingredients: [{ name: 'Salt', quantity: 'to taste', unit: undefined }],
        })
    })

    it.each([
        ['invalid JSON', '{'],
        ['a recipe that fails validation', JSON.stringify({ name: 'Incomplete' })],
        [
            'duplicate normalized ingredients',
            JSON.stringify({
                name: 'Omelet',
                instructions: 'Cook the eggs.',
                ingredients: [
                    { name: 'Scallion', quantity: '1' },
                    { name: 'green onion', quantity: '1' },
                ],
            }),
        ],
    ])('rejects %s as an invalid extraction', async (_case, outputText) => {
        createInteractionMock.mockResolvedValue({ output_text: outputText })

        await expect(importRecipe({ text: 'Recipe text' })).rejects.toMatchObject({
            code: 'invalid_extraction',
        })
    })

    it('rejects a missing output as a provider failure', async () => {
        createInteractionMock.mockResolvedValue({})

        await expect(importRecipe({ text: 'Recipe text' })).rejects.toMatchObject({
            code: 'provider_failure',
        })
    })

    it('reports missing API configuration without calling the provider', async () => {
        vi.stubEnv('GEMINI_API_KEY', '')

        await expect(importRecipe({ text: 'Recipe text' })).rejects.toEqual(
            expect.objectContaining<Partial<RecipeImportError>>({
                code: 'not_configured',
            }),
        )
        expect(createInteractionMock).not.toHaveBeenCalled()
    })

    it('maps provider rate limiting', async () => {
        createInteractionMock.mockRejectedValue({ status: 429 })

        await expect(importRecipe({ text: 'Recipe text' })).rejects.toMatchObject({
            code: 'rate_limited',
        })
    })

    it('maps provider timeouts', async () => {
        const timeout = new Error('timed out')
        timeout.name = 'RequestTimeoutError'
        createInteractionMock.mockRejectedValue(timeout)

        await expect(importRecipe({ text: 'Recipe text' })).rejects.toMatchObject({
            code: 'timeout',
        })
    })

    it('maps other network or provider errors without exposing their message', async () => {
        createInteractionMock.mockRejectedValue(new Error('sensitive provider response'))

        await expect(importRecipe({ text: 'Recipe text' })).rejects.toMatchObject({
            code: 'provider_failure',
            message: 'provider_failure',
        })
    })
})
