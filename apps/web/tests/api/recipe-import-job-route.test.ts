import { beforeEach, describe, expect, it, vi } from 'vitest'

const { auth, create, get, cancel } = vi.hoisted(() => ({
    auth: vi.fn(), create: vi.fn(), get: vi.fn(), cancel: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireAuth: auth }))
vi.mock('@/services/ai-job-service', () => ({
    createAiJob: create, getAiJobForUser: get, cancelAiJobForUser: cancel,
    AiJobEnqueueError: class AiJobEnqueueError extends Error {},
    ActiveImportLimitError: class ActiveImportLimitError extends Error {},
}))

import { POST as createRoute } from '@/app/api/recipe-imports/route'
import { GET } from '@/app/api/recipe-imports/[id]/route'
import { POST as cancelRoute } from '@/app/api/recipe-imports/[id]/cancel/route'

const id = 'cm12345678901234567890123'
const userId = 'cm22345678901234567890123'
const context = { params: Promise.resolve({ id }) }
const timestamp = new Date('2026-10-21T00:00:00.000Z')

beforeEach(() => {
    vi.clearAllMocks()
    auth.mockResolvedValue({ user: { id: userId }, response: null })
})

describe('recipe import job routes', () => {
    it('creates a pollable job without returning its input', async () => {
        create.mockResolvedValue({ id, expiresAt: timestamp })
        const response = await createRoute(new Request('http://localhost/api/recipe-imports', {
            method: 'POST', body: JSON.stringify({ type: 'text', text: 'Secret recipe text' }),
        }))
        expect(response.status).toBe(202)
        expect(await response.json()).toEqual({
            id, status: 'queued', sourceType: 'text', stage: 'queued',
            expiresAt: timestamp.toISOString(),
        })
        expect(create).toHaveBeenCalledWith({
            jobType: 'recipe_import', input: { type: 'text', text: 'Secret recipe text' }, userId,
        })
    })

    it('returns 400 for invalid input', async () => {
        const response = await createRoute(new Request('http://localhost/api/recipe-imports', {
            method: 'POST', body: JSON.stringify({ type: 'url', url: 'file:///private/recipe' }),
        }))
        expect(response.status).toBe(400)
        expect(create).not.toHaveBeenCalled()
    })

    it('returns 400 for malformed JSON without creating a job', async () => {
        const response = await createRoute(new Request('http://localhost/api/recipe-imports', {
            method: 'POST', body: '{',
        }))
        expect(response.status).toBe(400)
        expect(create).not.toHaveBeenCalled()
    })

    it('requires authentication on create, status, and cancel', async () => {
        auth.mockResolvedValue({ user: null, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) })
        const createResponse = await createRoute(new Request('http://localhost/api/recipe-imports', {
            method: 'POST', body: JSON.stringify({ type: 'text', text: 'Toast' }),
        }))
        const statusResponse = await GET(new Request('http://localhost/api/recipe-imports/' + id), context)
        const cancelResponse = await cancelRoute(new Request('http://localhost/api/recipe-imports/' + id + '/cancel', {
            method: 'POST',
        }), context)
        expect([createResponse.status, statusResponse.status, cancelResponse.status]).toEqual([401, 401, 401])
        expect(create).not.toHaveBeenCalled()
        expect(get).not.toHaveBeenCalled()
        expect(cancel).not.toHaveBeenCalled()
    })

    it('rejects invalid image data before enqueueing', async () => {
        const response = await createRoute(new Request('http://localhost/api/recipe-imports', {
            method: 'POST', body: JSON.stringify({ type: 'image', image: { mimeType: 'image/png', data: 'not-base64' } }),
        }))
        expect(response.status).toBe(400)
        expect(create).not.toHaveBeenCalled()
    })

    it('returns 413 for an oversized decoded image before enqueueing', async () => {
        const response = await createRoute(new Request('http://localhost/api/recipe-imports', {
            method: 'POST', body: JSON.stringify({
                type: 'image', image: { mimeType: 'image/png', data: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') },
            }),
        }))
        expect(response.status).toBe(413)
        expect(create).not.toHaveBeenCalled()
    })

    it('returns 503 when enqueue fails', async () => {
        const { AiJobEnqueueError } = await import('@/services/ai-job-service')
        create.mockRejectedValue(new AiJobEnqueueError())
        const response = await createRoute(new Request('http://localhost/api/recipe-imports', {
            method: 'POST', body: JSON.stringify({ type: 'text', text: 'Toast' }),
        }))
        expect(response.status).toBe(503)
    })

    it('returns 429 when the user has too many active imports', async () => {
        const { ActiveImportLimitError } = await import('@/services/ai-job-service')
        create.mockRejectedValue(new ActiveImportLimitError())
        const response = await createRoute(new Request('http://localhost/api/recipe-imports', {
            method: 'POST', body: JSON.stringify({ type: 'text', text: 'Toast' }),
        }))
        expect(response.status).toBe(429)
    })

    it('returns only public status and draft fields', async () => {
        const draft = { name: 'Toast', instructions: 'Toast bread.', ingredients: [{ name: 'Bread', quantity: '2' }] }
        get.mockResolvedValue({
            id, status: 'SUCCEEDED', sourceType: 'text', progressMessage: 'Completed',
            resultJson: draft, errorCode: null, errorMessage: null,
            createdAt: timestamp, updatedAt: timestamp, expiresAt: timestamp,
        })
        const response = await GET(new Request('http://localhost/api/recipe-imports/' + id), context)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            id, status: 'succeeded', sourceType: 'text', stage: 'complete',
            draft, error: null, createdAt: timestamp.toISOString(),
            updatedAt: timestamp.toISOString(), expiresAt: timestamp.toISOString(),
        })
        expect(get).toHaveBeenCalledWith(id, userId)
    })

    it('uses 404 for missing or unowned jobs', async () => {
        get.mockResolvedValue(null)
        const response = await GET(new Request('http://localhost/api/recipe-imports/' + id), context)
        expect(response.status).toBe(404)
    })

    it('cancels an owned job', async () => {
        cancel.mockResolvedValue({
            id, status: 'CANCELED', sourceType: 'url', progressMessage: 'normalizing',
            resultJson: null, errorCode: null, errorMessage: null,
            createdAt: timestamp, updatedAt: timestamp, expiresAt: timestamp,
        })
        const response = await cancelRoute(new Request('http://localhost/api/recipe-imports/' + id + '/cancel', {
            method: 'POST',
        }), context)
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ status: 'canceled', stage: 'normalizing' })
        expect(cancel).toHaveBeenCalledWith(id, userId)
    })
})
