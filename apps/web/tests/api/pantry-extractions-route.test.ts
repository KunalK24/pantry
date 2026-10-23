import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAuth, extractPantryItems } = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    extractPantryItems: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireAuth }))
vi.mock('@/services/pantry-extraction-service', () => ({
    extractPantryItems,
    PantryImportError: class PantryImportError extends Error {
        constructor(public readonly code: string) { super(code) }
    },
}))

import { POST } from '@/app/api/pantry-extractions/route'

const endpoint = 'http://localhost/api/pantry-extractions'
const image = { type: 'image', image: { mimeType: 'image/jpeg', data: 'aGVsbG8=' } }

function request(body: unknown) {
    return new Request(endpoint, { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue({ user: { id: 'user-1' }, response: null })
})

describe('POST /api/pantry-extractions', () => {
    it('passes a valid image to extraction and returns the item draft', async () => {
        extractPantryItems.mockResolvedValue([{ name: 'Carrots', quantity: '1', unit: 'bag' }])
        const response = await POST(request(image))
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ items: [{ name: 'Carrots', quantity: '1', unit: 'bag' }] })
        expect(extractPantryItems).toHaveBeenCalledWith(image)
    })

    it('requires authentication', async () => {
        requireAuth.mockResolvedValue({ user: null, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) })
        const response = await POST(request(image))
        expect(response.status).toBe(401)
        expect(extractPantryItems).not.toHaveBeenCalled()
    })

    it.each([
        [{ ...image, type: 'text' }, 400],
        [{ ...image, image: { ...image.image, data: 'invalid!' } }, 400],
        [{ ...image, image: { ...image.image, data: 'A'.repeat(7_000_000) } }, 413],
    ])('rejects invalid image requests', async (body, status) => {
        const response = await POST(request(body))
        expect(response.status).toBe(status)
        expect(extractPantryItems).not.toHaveBeenCalled()
    })

    it('reports missing Gemini configuration', async () => {
        const { PantryImportError } = await import('@/services/pantry-extraction-service')
        extractPantryItems.mockRejectedValue(new PantryImportError('not_configured'))
        const response = await POST(request(image))
        expect(response.status).toBe(503)
        await expect(response.json()).resolves.toMatchObject({ code: 'not_configured' })
    })
})
