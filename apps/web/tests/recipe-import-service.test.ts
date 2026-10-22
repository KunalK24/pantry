import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { geminiCreate, geminiClient, fetchHtml, pythonParse } = vi.hoisted(() => ({
    geminiCreate: vi.fn(), geminiClient: vi.fn(), fetchHtml: vi.fn(), pythonParse: vi.fn(),
}))

vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        interactions = { create: geminiCreate }
        constructor(options: unknown) { geminiClient(options) }
    },
}))
vi.mock('@/services/recipe-url-acquisition-service', () => ({
    fetchRecipeHtml: fetchHtml,
    RecipeUrlAcquisitionError: class extends Error {
        constructor(public code: string) { super(code) }
    },
}))
vi.mock('@/lib/python-parser', () => ({ parseRecipeWithPython: pythonParse }))

import { importRecipe } from '@/services/recipe-import-service'
import { RecipeUrlAcquisitionError } from '@/services/recipe-url-acquisition-service'

const recipe = {
    name: 'Toast', instructions: 'Toast bread.',
    ingredients: [{ name: 'Bread', quantity: '2', unit: 'slices' }],
}
const url = 'https://example.com/recipe'

function firecrawlResponse(markdown: string, statusCode = 200, success = true): Response {
    return Response.json({ success, data: { markdown, metadata: { statusCode } } })
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('GEMINI_API_KEY', 'gemini-test')
    vi.stubEnv('FIRECRAWL_API_KEY', 'firecrawl-test')
    vi.stubEnv('GEMINI_MODEL', 'configured-model')
    fetchHtml.mockResolvedValue({ html: '<html>recipe</html>', finalUrl: url })
    pythonParse.mockResolvedValue(recipe)
    geminiCreate.mockResolvedValue({ output_text: JSON.stringify(recipe) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(firecrawlResponse('# Toast\n## Ingredients\n- 2 slices bread\n## Instructions\nToast bread.')))
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
})

describe('recipe import service', () => {
    it('returns a valid Python draft without either paid provider', async () => {
        vi.stubEnv('GEMINI_API_KEY', '')
        vi.stubEnv('FIRECRAWL_API_KEY', '')
        await expect(importRecipe({ type: 'url', url })).resolves.toEqual(recipe)
        expect(fetchHtml).toHaveBeenCalledWith(url, undefined)
        expect(pythonParse).toHaveBeenCalledWith(url, '<html>recipe</html>', undefined)
        expect(fetch).not.toHaveBeenCalled()
        expect(geminiCreate).not.toHaveBeenCalled()
    })

    it('reports direct import stages in order and awaits each callback', async () => {
        const stages: string[] = []
        await importRecipe({ type: 'url', url }, {
            onProgress: async (stage) => { stages.push(stage) },
        })
        expect(stages).toEqual(['acquiring_source', 'normalizing', 'validating'])
    })

    it('uses the final redirected URL for Python parsing', async () => {
        fetchHtml.mockResolvedValue({ html: '<html>recipe</html>', finalUrl: 'https://example.com/final' })
        await importRecipe({ type: 'url', url })
        expect(pythonParse).toHaveBeenCalledWith('https://example.com/final', '<html>recipe</html>', undefined)
    })

    it.each(['incomplete', 'unavailable', 'timeout', 'invalid_output'])(
        'scrapes once and calls Gemini once when Python is %s', async (reason) => {
            pythonParse.mockRejectedValue(new Error(reason))
            await expect(importRecipe({ type: 'url', url })).resolves.toEqual(recipe)
            expect(fetch).toHaveBeenCalledOnce()
            expect(fetch).toHaveBeenCalledWith('https://api.firecrawl.dev/v2/scrape', expect.objectContaining({
                method: 'POST', signal: expect.any(AbortSignal),
            }))
            const [, request] = vi.mocked(fetch).mock.calls[0]
            expect(JSON.parse(request!.body as string)).toEqual({
                url, formats: ['markdown'], onlyMainContent: true, proxy: 'basic',
            })
            expect(geminiCreate).toHaveBeenCalledOnce()
            expect(geminiCreate.mock.calls[0][0]).toMatchObject({
                model: 'configured-model', store: false,
                input: expect.stringContaining('# Toast'),
            })
            expect(geminiCreate.mock.calls[0][0]).not.toHaveProperty('tools')
        },
    )

    it('falls back when the direct acquisition fails', async () => {
        fetchHtml.mockRejectedValue(new RecipeUrlAcquisitionError('access_denied'))
        await expect(importRecipe({ type: 'url', url })).resolves.toEqual(recipe)
        expect(pythonParse).not.toHaveBeenCalled()
        expect(fetch).toHaveBeenCalledOnce()
    })

    it('reports the acquisition and extraction stages through fallback', async () => {
        const stages: string[] = []
        pythonParse.mockRejectedValue(new Error('incomplete'))
        await importRecipe({ type: 'url', url }, { onProgress: (stage) => { stages.push(stage) } })
        expect(stages).toEqual([
            'acquiring_source', 'normalizing', 'acquiring_source', 'normalizing', 'validating',
        ])
    })

    it('propagates progress persistence failures without starting a provider fallback', async () => {
        const progressError = new Error('progress write failed')
        await expect(importRecipe({ type: 'url', url }, {
            onProgress: (stage) => {
                if (stage === 'normalizing') throw progressError
            },
        })).rejects.toBe(progressError)
        expect(pythonParse).not.toHaveBeenCalled()
        expect(fetch).not.toHaveBeenCalled()
    })

    it('reports missing Firecrawl configuration only when fallback is needed', async () => {
        pythonParse.mockRejectedValue(new Error('incomplete'))
        vi.stubEnv('FIRECRAWL_API_KEY', '')
        await expect(importRecipe({ type: 'url', url })).rejects.toMatchObject({ code: 'not_configured' })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('rejects an unsafe URL without sending it to Firecrawl', async () => {
        fetchHtml.mockRejectedValue(new RecipeUrlAcquisitionError('unsafe_url'))
        await expect(importRecipe({ type: 'url', url })).rejects.toMatchObject({ code: 'invalid_source' })
        expect(fetch).not.toHaveBeenCalled()
        expect(geminiCreate).not.toHaveBeenCalled()
    })

    it('requires both Firecrawl API success and a successful target-page status', async () => {
        pythonParse.mockRejectedValue(new Error('incomplete'))
        vi.mocked(fetch).mockResolvedValueOnce(firecrawlResponse('# Toast', 200, false))
        await expect(importRecipe({ type: 'url', url })).rejects.toMatchObject({ code: 'provider_failure' })
        vi.mocked(fetch).mockResolvedValueOnce(firecrawlResponse('# Toast', 403))
        await expect(importRecipe({ type: 'url', url })).rejects.toMatchObject({ code: 'source_access_denied' })
        vi.mocked(fetch).mockResolvedValueOnce(firecrawlResponse('# Toast', 404))
        await expect(importRecipe({ type: 'url', url })).rejects.toMatchObject({ code: 'invalid_source' })
        expect(geminiCreate).not.toHaveBeenCalled()
    })

    it.each(['CAPTCHA required', 'Checking your browser', 'Access denied'])(
        'rejects a Firecrawl access page: %s', async (markdown) => {
            pythonParse.mockRejectedValue(new Error('incomplete'))
            vi.mocked(fetch).mockResolvedValue(firecrawlResponse(markdown))
            await expect(importRecipe({ type: 'url', url })).rejects.toMatchObject({ code: 'source_access_denied' })
            expect(geminiCreate).not.toHaveBeenCalled()
        },
    )

    it.each(['Sign in to view this recipe', 'Accept cookies to continue', 'Cookie consent required'])(
        'rejects a Firecrawl access or consent page: %s', async (markdown) => {
            pythonParse.mockRejectedValue(new Error('incomplete'))
            vi.mocked(fetch).mockResolvedValue(firecrawlResponse(markdown))
            await expect(importRecipe({ type: 'url', url })).rejects.toMatchObject({ code: 'source_access_denied' })
            expect(geminiCreate).not.toHaveBeenCalled()
        },
    )

    it('rejects non-recipe markdown before Gemini', async () => {
        pythonParse.mockRejectedValue(new Error('incomplete'))
        vi.mocked(fetch).mockResolvedValue(firecrawlResponse('# Travel guide\nVisit museums and parks.'))
        await expect(importRecipe({ type: 'url', url })).rejects.toMatchObject({ code: 'invalid_source' })
        expect(geminiCreate).not.toHaveBeenCalled()
    })

    it('validates the Gemini fallback draft', async () => {
        pythonParse.mockRejectedValue(new Error('incomplete'))
        geminiCreate.mockResolvedValue({ output_text: JSON.stringify({ ...recipe, ingredients: [] }) })
        await expect(importRecipe({ type: 'url', url })).rejects.toMatchObject({ code: 'invalid_extraction' })
        expect(geminiCreate).toHaveBeenCalledOnce()
    })

    it('keeps text and image on one Gemini request with no Firecrawl', async () => {
        await expect(importRecipe({ type: 'text', text: 'Toast bread' })).resolves.toEqual(recipe)
        const imageData = Buffer.from('image').toString('base64')
        await expect(importRecipe({ type: 'image', image: { mimeType: 'image/png', data: imageData } })).resolves.toEqual(recipe)
        expect(geminiCreate).toHaveBeenCalledTimes(2)
        expect(geminiCreate.mock.calls[0][0].store).toBe(false)
        expect(geminiCreate.mock.calls[1][0].input[1]).toEqual({ type: 'image', mime_type: 'image/png', data: imageData })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('reports text and image stages in order', async () => {
        const stages: string[] = []
        const onProgress = (stage: string) => { stages.push(stage) }
        await importRecipe({ type: 'text', text: 'Toast bread' }, { onProgress })
        expect(stages).toEqual(['acquiring_source', 'normalizing', 'validating'])
        stages.length = 0
        await importRecipe({
            type: 'image', image: { mimeType: 'image/png', data: Buffer.from('image').toString('base64') },
        }, { onProgress })
        expect(stages).toEqual(['acquiring_source', 'normalizing', 'validating'])
    })

    it('accepts a near-limit valid image without recursive base64 matching', async () => {
        const imageData = Buffer.alloc((5 * 1024 * 1024) - 1, 42).toString('base64')
        await expect(importRecipe({
            type: 'image', image: { mimeType: 'image/jpeg', data: imageData },
        })).resolves.toEqual(recipe)
        expect(geminiCreate).toHaveBeenCalledOnce()
        expect(fetch).not.toHaveBeenCalled()
    })

    it('preserves cancellation before provider fallback', async () => {
        const controller = new AbortController()
        fetchHtml.mockImplementation(async () => {
            controller.abort()
            throw new Error('aborted')
        })
        await expect(importRecipe({ type: 'url', url }, { signal: controller.signal }))
            .rejects.toMatchObject({ code: 'timeout' })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('enforces Gemini deadline when the SDK promise ignores abort', async () => {
        const deadline = new AbortController()
        vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
        let markStarted: (() => void) | undefined
        const started = new Promise<void>((resolve) => { markStarted = resolve })
        geminiCreate.mockImplementation(() => {
            markStarted?.()
            return new Promise(() => undefined)
        })

        const importPromise = importRecipe({ type: 'text', text: 'Toast bread' })
        await started
        expect(geminiCreate).toHaveBeenCalledOnce()
        deadline.abort(new DOMException('Gemini deadline reached', 'TimeoutError'))

        await expect(importPromise).rejects.toMatchObject({ code: 'timeout' })
    })
})
