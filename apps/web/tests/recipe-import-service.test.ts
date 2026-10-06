import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createInteractionMock, createClientMock, lookupMock } = vi.hoisted(() => ({
    createInteractionMock: vi.fn(),
    createClientMock: vi.fn(),
    lookupMock: vi.fn(),
}))

vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        interactions = { create: createInteractionMock }

        constructor(options: unknown) {
            createClientMock(options)
        }
    },
}))

vi.mock('node:dns/promises', () => ({
    lookup: lookupMock,
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
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
})

describe('importRecipe', () => {
    it('returns a validated recipe draft from structured provider output', async () => {
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify(extractedRecipe),
        })

        await expect(importRecipe({ type: 'text', text: 'French Toast\n2 slices bread' }))
            .resolves.toEqual(extractedRecipe)

        expect(createClientMock).toHaveBeenCalledWith({ apiKey: 'test-api-key' })
        expect(createInteractionMock).toHaveBeenCalledOnce()

        const [request, options] = createInteractionMock.mock.calls[0]
        expect(request).toMatchObject({
            model: 'gemini-3.8-flash',
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

    it('uses Gemini 3.8 Flash as the primary model', async () => {
        vi.stubEnv('GEMINI_MODEL', 'custom-gemini-model')
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify(extractedRecipe),
        })

        await importRecipe({ type: 'text', text: 'Recipe text' })

        expect(createInteractionMock.mock.calls[0][0].model).toBe('gemini-3.8-flash')
    })

    it('falls back to Gemini 3.7 Flash when the primary model is unavailable', async () => {
        createInteractionMock
            .mockRejectedValueOnce({ status: 503 })
            .mockResolvedValueOnce({
                output_text: JSON.stringify(extractedRecipe),
            })

        await expect(importRecipe({ type: 'text', text: 'Recipe text' }))
            .resolves.toEqual(extractedRecipe)

        expect(createInteractionMock).toHaveBeenCalledTimes(2)
        expect(createInteractionMock.mock.calls.map(([request]) => request.model)).toEqual([
            'gemini-3.8-flash',
            'gemini-3.7-flash',
        ])
        expect(createInteractionMock.mock.calls[1][1].retries).toEqual({ strategy: 'none' })
        expect(createInteractionMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal)
    })

    it('falls back to Gemini 3.6 Flash when the first fallback is unavailable', async () => {
        createInteractionMock
            .mockRejectedValueOnce({ status: 503 })
            .mockRejectedValueOnce(new Error('model is experiencing high demand'))
            .mockResolvedValueOnce({
                output_text: JSON.stringify(extractedRecipe),
            })

        await expect(importRecipe({ type: 'text', text: 'Recipe text' }))
            .resolves.toEqual(extractedRecipe)

        expect(createInteractionMock).toHaveBeenCalledTimes(3)
        expect(createInteractionMock.mock.calls.map(([request]) => request.model)).toEqual([
            'gemini-3.8-flash',
            'gemini-3.7-flash',
            'gemini-3.6-flash',
        ])
    })

    it('falls back to Gemini 3.1 Flash Lite when the 3.x Flash models are unavailable', async () => {
        createInteractionMock
            .mockRejectedValueOnce({ status: 503 })
            .mockRejectedValueOnce(new Error('service unavailable'))
            .mockRejectedValueOnce(new Error('model capacity exceeded'))
            .mockResolvedValueOnce({
                output_text: JSON.stringify(extractedRecipe),
            })

        await expect(importRecipe({ type: 'text', text: 'Recipe text' }))
            .resolves.toEqual(extractedRecipe)

        expect(createInteractionMock).toHaveBeenCalledTimes(4)
        expect(createInteractionMock.mock.calls.map(([request]) => request.model)).toEqual([
            'gemini-3.8-flash',
            'gemini-3.7-flash',
            'gemini-3.6-flash',
            'gemini-3.1-flash-lite',
        ])
    })

    it('returns provider failure when all fallback models are unavailable', async () => {
        createInteractionMock
            .mockRejectedValueOnce({ status: 503 })
            .mockRejectedValueOnce(new Error('service unavailable'))
            .mockRejectedValueOnce(new Error('model capacity exceeded'))
            .mockRejectedValueOnce(new Error('temporarily unavailable'))

        await expect(importRecipe({ type: 'text', text: 'Recipe text' })).rejects.toMatchObject({
            code: 'provider_failure',
            message: 'provider_failure',
        })

        expect(createInteractionMock).toHaveBeenCalledTimes(4)
        expect(createInteractionMock.mock.calls.map(([request]) => request.model)).toEqual([
            'gemini-3.8-flash',
            'gemini-3.7-flash',
            'gemini-3.6-flash',
            'gemini-3.1-flash-lite',
        ])
    })

    it('does not fall back for non-availability provider errors', async () => {
        createInteractionMock.mockRejectedValue({ status: 400 })

        await expect(importRecipe({ type: 'text', text: 'Recipe text' })).rejects.toMatchObject({
            code: 'provider_failure',
        })

        expect(createInteractionMock).toHaveBeenCalledOnce()
        expect(createInteractionMock.mock.calls[0][0].model).toBe('gemini-3.8-flash')
    })

    it('preserves textual quantities and trims validated fields', async () => {
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify({
                name: ' Seasoning ',
                instructions: ' Mix. ',
                ingredients: [{ name: ' Salt ', quantity: ' to taste ', unit: ' ' }],
            }),
        })

        await expect(importRecipe({ type: 'text', text: 'Seasoning recipe' })).resolves.toEqual({
            name: 'Seasoning',
            instructions: 'Mix.',
            ingredients: [{ name: 'Salt', quantity: 'to taste', unit: undefined }],
        })
    })

    it('sends image imports as multimodal Gemini input', async () => {
        const imageData = Buffer.from('recipe image').toString('base64')
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify(extractedRecipe),
        })

        await expect(importRecipe({
            type: 'image',
            image: {
                mimeType: 'image/png',
                data: imageData,
            },
        })).resolves.toEqual(extractedRecipe)

        const [request] = createInteractionMock.mock.calls[0]
        expect(request.input).toEqual([
            {
                type: 'text',
                text: 'Recipe source image: extract the recipe draft from the attached image.',
            },
            {
                type: 'image',
                mime_type: 'image/png',
                data: imageData,
            },
        ])
        expect(request.system_instruction).toContain('recipe image')
        expect(request.system_instruction).toContain('untrusted data')
    })

    it.each([
        ['invalid base64', 'not base64'],
        ['an empty decoded payload', ''],
        ['an oversized payload', Buffer.alloc((5 * 1024 * 1024) + 1).toString('base64')],
    ])('rejects image imports with %s', async (_case, data) => {
        await expect(importRecipe({
            type: 'image',
            image: {
                mimeType: 'image/jpeg',
                data,
            },
        })).rejects.toMatchObject({
            code: 'invalid_source',
        })

        expect(createInteractionMock).not.toHaveBeenCalled()
    })

    it('extracts Schema.org Recipe JSON-LD from URL imports', async () => {
        const recipeJsonLd = {
            '@context': 'https://schema.org',
            '@graph': [
                { '@type': 'WebPage', name: 'Page' },
                {
                    '@type': ['Thing', 'Recipe'],
                    name: 'Pancakes',
                    description: 'Fluffy pancakes',
                    recipeIngredient: ['1 cup flour', '1 egg'],
                    recipeInstructions: [
                        {
                            '@type': 'HowToSection',
                            name: 'Batter',
                            itemListElement: [
                                { '@type': 'HowToStep', text: 'Whisk ingredients.' },
                            ],
                        },
                        { '@type': 'HowToStep', text: 'Cook on a skillet.' },
                    ],
                    recipeYield: '4 pancakes',
                    prepTime: 'PT10M',
                    cookTime: 'PT5M',
                    keywords: ['breakfast', 'easy'],
                },
            ],
        }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`
            <html>
                <script type="application/ld+json">${JSON.stringify(recipeJsonLd)}</script>
            </html>
        `, {
            headers: { 'content-type': 'text/html; charset=utf-8' },
        })))
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify(extractedRecipe),
        })

        await expect(importRecipe({
            type: 'url',
            url: 'https://example.com/pancakes',
        })).resolves.toEqual(extractedRecipe)

        expect(fetch).toHaveBeenCalledWith('https://example.com/pancakes', {
            redirect: 'manual',
            signal: expect.any(AbortSignal),
        })

        const [request] = createInteractionMock.mock.calls[0]
        expect(request.input).toContain('Recipe URL source content:')
        expect(request.input).toContain('Name:\nPancakes')
        expect(request.input).toContain('Ingredients:\n1 cup flour, 1 egg')
        expect(request.input).toContain('Batter:')
        expect(request.input).toContain('Cook on a skillet.')
        expect(request.input).not.toContain('Page')
        expect(request.system_instruction).toContain('recipe URL')
        expect(request.system_instruction).toContain('untrusted data')
    })

    it('falls back to cleaned page text when URL imports do not have Recipe JSON-LD', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`
            <html>
                <head><style>.ad { color: red; }</style></head>
                <body>
                    <script>window.bad = true</script>
                    <h1>Soup</h1>
                    <p>Use broth &amp; noodles.</p>
                </body>
            </html>
        `, {
            headers: { 'content-type': 'text/html' },
        })))
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify(extractedRecipe),
        })

        await importRecipe({
            type: 'url',
            url: 'https://example.com/soup',
        })

        const [request] = createInteractionMock.mock.calls[0]
        expect(request.input).toContain('Readable page text:')
        expect(request.input).toContain('Soup')
        expect(request.input).toContain('Use broth & noodles.')
        expect(request.input).not.toContain('window.bad')
        expect(request.input).not.toContain('color: red')
    })

    it('uses recipe-relevant page text when visible URL content has recipe sections', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`
            <html>
                <body>
                    <main>
                        <h1>Hand Pulled Noodles</h1>
                        <p>Recipe intro</p>
                        <p>Subscribe for more updates</p>
                        <p>Watch the latest episode</p>
                        <p>Buy the cookbook</p>
                        <h2>Ingredients</h2>
                        <ul><li>500 grams flour</li><li>Water</li></ul>
                        <h2>Directions</h2>
                        <p>Mix, rest, pull, and cook.</p>
                    </main>
                </body>
            </html>
        `, {
            headers: { 'content-type': 'text/html' },
        })))
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify(extractedRecipe),
        })

        await importRecipe({
            type: 'url',
            url: 'https://example.com/noodles',
        })

        const [request] = createInteractionMock.mock.calls[0]
        expect(request.input).toContain('Readable page text:')
        expect(request.input).toContain('Hand Pulled Noodles')
        expect(request.input).toContain('Ingredients')
        expect(request.input).toContain('500 grams flour')
        expect(request.input).toContain('Directions')
        expect(request.input).toContain('Mix, rest, pull, and cook.')
        expect(request.input).not.toContain('Subscribe for more updates')
    })

    it('includes readable page text when Recipe JSON-LD is missing ingredients and instructions', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`
            <html>
                <head>
                    <script type="application/ld+json">
                        {
                            "@context": "https://schema.org",
                            "@type": "Recipe",
                            "name": "Spicy Vodka Pasta",
                            "description": "A rich pasta recipe"
                        }
                    </script>
                </head>
                <body>
                    <h2>Ingredients</h2>
                    <ul><li>1 pound pasta</li><li>Tomato paste</li></ul>
                    <h2>Directions</h2>
                    <p>Cook the pasta and toss with sauce.</p>
                </body>
            </html>
        `, {
            headers: { 'content-type': 'text/html' },
        })))
        createInteractionMock.mockResolvedValue({
            output_text: JSON.stringify(extractedRecipe),
        })

        await importRecipe({
            type: 'url',
            url: 'https://example.com/vodka-pasta',
        })

        const [request] = createInteractionMock.mock.calls[0]
        expect(request.input).toContain('Name:\nSpicy Vodka Pasta')
        expect(request.input).toContain('Readable page text:')
        expect(request.input).toContain('Ingredients')
        expect(request.input).toContain('1 pound pasta')
        expect(request.input).toContain('Directions')
        expect(request.input).toContain('Cook the pasta and toss with sauce.')
    })

    it('falls back to the next model when URL generation hits an SDK timeout', async () => {
        const timeout = new Error('request timed out')
        timeout.name = 'APIConnectionTimeoutError'
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`
            <html>
                <body>
                    <h1>Noodles</h1>
                    <h2>Ingredients</h2>
                    <p>Flour and water</p>
                    <h2>Directions</h2>
                    <p>Pull and boil.</p>
                </body>
            </html>
        `, {
            headers: { 'content-type': 'text/html' },
        })))
        createInteractionMock
            .mockRejectedValueOnce(timeout)
            .mockResolvedValueOnce({
                output_text: JSON.stringify(extractedRecipe),
            })

        await expect(importRecipe({
            type: 'url',
            url: 'https://example.com/noodles',
        })).resolves.toEqual(extractedRecipe)

        expect(createInteractionMock).toHaveBeenCalledTimes(2)
        expect(createInteractionMock.mock.calls.map(([request]) => request.model)).toEqual([
            'gemini-3.8-flash',
            'gemini-3.7-flash',
        ])
    })

    it('reports a timeout when all URL generation model attempts time out', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`
            <html>
                <body>
                    <h1>Noodles</h1>
                    <h2>Ingredients</h2>
                    <p>Flour and water</p>
                    <h2>Directions</h2>
                    <p>Pull and boil.</p>
                </body>
            </html>
        `, {
            headers: { 'content-type': 'text/html' },
        })))
        createInteractionMock.mockImplementation(() => {
            const timeout = new Error('request timed out')
            timeout.name = 'APIConnectionTimeoutError'

            return Promise.reject(timeout)
        })

        await expect(importRecipe({
            type: 'url',
            url: 'https://example.com/noodles',
        })).rejects.toMatchObject({
            code: 'timeout',
        })

        expect(createInteractionMock).toHaveBeenCalledTimes(4)
        expect(createInteractionMock.mock.calls.map(([request]) => request.model)).toEqual([
            'gemini-3.8-flash',
            'gemini-3.7-flash',
            'gemini-3.6-flash',
            'gemini-3.1-flash-lite',
        ])
    })

    it.each([
        ['failed fetch', () => Promise.reject(new TypeError('fetch failed')), 'provider_failure'],
        ['non-HTML content', () => Promise.resolve(new Response('{}', {
            headers: { 'content-type': 'application/json' },
        })), 'invalid_source'],
        ['oversized HTML', () => Promise.resolve(new Response('a'.repeat((1024 * 1024) + 1), {
            headers: { 'content-type': 'text/html' },
        })), 'invalid_source'],
    ])('maps URL import %s safely', async (_case, createFetchResult, code) => {
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(createFetchResult()))

        await expect(importRecipe({
            type: 'url',
            url: 'https://example.com/recipe',
        })).rejects.toMatchObject({ code })

        expect(createInteractionMock).not.toHaveBeenCalled()
    })

    it.each([
        ['localhost', 'http://localhost/recipe'],
        ['loopback IPv4', 'http://127.0.0.1/recipe'],
        ['private IPv4', 'https://192.168.1.10/recipe'],
        ['link-local metadata IPv4', 'http://169.254.169.254/latest/meta-data'],
        ['IPv6 loopback', 'http://[::1]/recipe'],
        ['IPv6 unique-local', 'http://[fd00::1]/recipe'],
    ])('rejects URL imports for %s before fetching', async (_case, url) => {
        vi.stubGlobal('fetch', vi.fn())

        await expect(importRecipe({
            type: 'url',
            url,
        })).rejects.toMatchObject({
            code: 'invalid_source',
        })

        expect(fetch).not.toHaveBeenCalled()
        expect(createInteractionMock).not.toHaveBeenCalled()
    })

    it('rejects URL imports when DNS resolves to a private address', async () => {
        lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
        vi.stubGlobal('fetch', vi.fn())

        await expect(importRecipe({
            type: 'url',
            url: 'https://recipes.example/chili',
        })).rejects.toMatchObject({
            code: 'invalid_source',
        })

        expect(lookupMock).toHaveBeenCalledWith('recipes.example', {
            all: true,
            verbatim: true,
        })
        expect(fetch).not.toHaveBeenCalled()
        expect(createInteractionMock).not.toHaveBeenCalled()
    })

    it('rejects URL imports when a redirect target is private', async () => {
        lookupMock.mockImplementation(async (hostname: string) => {
            if (hostname === 'recipes.example') {
                return [{ address: '93.184.216.34', family: 4 }]
            }

            return [{ address: '127.0.0.1', family: 4 }]
        })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
            headers: { location: 'http://internal.example/recipe' },
            status: 302,
        })))

        await expect(importRecipe({
            type: 'url',
            url: 'https://recipes.example/redirect',
        })).rejects.toMatchObject({
            code: 'invalid_source',
        })

        expect(fetch).toHaveBeenCalledOnce()
        expect(fetch).toHaveBeenCalledWith('https://recipes.example/redirect', {
            redirect: 'manual',
            signal: expect.any(AbortSignal),
        })
        expect(createInteractionMock).not.toHaveBeenCalled()
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

        await expect(importRecipe({ type: 'text', text: 'Recipe text' })).rejects.toMatchObject({
            code: 'invalid_extraction',
        })
    })

    it('rejects a missing output as a provider failure', async () => {
        createInteractionMock.mockResolvedValue({})

        await expect(importRecipe({ type: 'text', text: 'Recipe text' })).rejects.toMatchObject({
            code: 'provider_failure',
        })
    })

    it('reports missing API configuration without calling the provider', async () => {
        vi.stubEnv('GEMINI_API_KEY', '')

        await expect(importRecipe({ type: 'text', text: 'Recipe text' })).rejects.toEqual(
            expect.objectContaining<Partial<RecipeImportError>>({
                code: 'not_configured',
            }),
        )
        expect(createInteractionMock).not.toHaveBeenCalled()
    })

    it('maps provider rate limiting', async () => {
        createInteractionMock.mockRejectedValue({ status: 429 })

        await expect(importRecipe({ type: 'text', text: 'Recipe text' })).rejects.toMatchObject({
            code: 'rate_limited',
        })
    })

    it('maps provider timeouts', async () => {
        const timeout = new Error('timed out')
        timeout.name = 'RequestTimeoutError'
        createInteractionMock.mockRejectedValue(timeout)

        await expect(importRecipe({ type: 'text', text: 'Recipe text' })).rejects.toMatchObject({
            code: 'timeout',
        })
    })

    it('maps other network or provider errors without exposing their message', async () => {
        createInteractionMock.mockRejectedValue(new Error('sensitive provider response'))

        await expect(importRecipe({ type: 'text', text: 'Recipe text' })).rejects.toMatchObject({
            code: 'provider_failure',
            message: 'provider_failure',
        })
    })
})
