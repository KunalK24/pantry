import { requireAuth } from '@/lib/auth'
import { recipeInputRequestSchema } from '@/schemas/recipe'
import { ActiveImportLimitError, AiJobEnqueueError, createAiJob } from '@/services/ai-job-service'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_BODY_BYTES = 7_100_000
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

class RequestTooLargeError extends Error {}

async function readJson(request: Request): Promise<unknown> {
    const declaredLength = Number(request.headers.get('content-length'))
    if (declaredLength > MAX_BODY_BYTES) throw new RequestTooLargeError()
    if (!request.body) return JSON.parse('')

    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_BODY_BYTES) {
            await reader.cancel()
            throw new RequestTooLargeError()
        }
        chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function imageError(data: string): 400 | 413 | null {
    const compact = data.replace(/\s/g, '')
    if (!compact) return 400
    const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0
    const decodedBytes = compact.length / 4 * 3 - padding
    if (decodedBytes > MAX_IMAGE_BYTES) return 413
    if (!BASE64_PATTERN.test(compact)) return 400
    if (Buffer.from(compact, 'base64').toString('base64') !== compact) return 400
    return null
}

export async function POST(request: Request) {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    let body: unknown
    try { body = await readJson(request) }
    catch (error) {
        if (error instanceof RequestTooLargeError) {
            return Response.json({ error: 'Recipe import request is too large' }, { status: 413 })
        }
        return Response.json({ error: 'Malformed JSON' }, { status: 400 })
    }

    const parsed = recipeInputRequestSchema.safeParse(body)
    if (!parsed.success) {
        return Response.json({ error: 'Invalid recipe import request' }, { status: 400 })
    }
    if (parsed.data.type === 'image') {
        const errorStatus = imageError(parsed.data.image.data)
        if (errorStatus) {
            return Response.json({
                error: errorStatus === 413 ? 'Image exceeds 5 MiB' : 'Invalid image data',
            }, { status: errorStatus })
        }
    }
    try {
        const job = await createAiJob({
            jobType: 'recipe_import', input: parsed.data, userId: auth.user.id,
        })
        return Response.json({
            id: job.id, status: 'queued', sourceType: parsed.data.type,
            stage: 'queued', expiresAt: job.expiresAt.toISOString(),
        }, { status: 202 })
    } catch (error) {
        if (error instanceof AiJobEnqueueError) {
            return Response.json({ error: 'Recipe import queue is unavailable' }, { status: 503 })
        }
        if (error instanceof ActiveImportLimitError) {
            return Response.json({ error: 'Too many active recipe imports' }, { status: 429 })
        }
        throw error
    }
}
