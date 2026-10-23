import { requireAuth } from '@/lib/auth'
import { pantryExtractionRequestSchema } from '@/schemas/pantry-item'
import { extractPantryItems, PantryImportError } from '@/services/pantry-extraction-service'

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
    try { 
        body = await readJson(request) 
    } catch (error) {
        if (error instanceof RequestTooLargeError) {
            return Response.json({error: 'Pantry Extraction request is too large' }, { status: 413 })
        }
        return Response.json({ error: 'Malformed JSON'}, { status: 400 })
    }

    const parsed = pantryExtractionRequestSchema.safeParse(body)
    if (!parsed.success) {
        return Response.json({ error: 'Invalid pantry extraction request'}, { status: 400 })
    }

    const errorStatus = imageError(parsed.data.image.data)
    if (errorStatus) {
        return Response.json({
            error: errorStatus === 413 ? 'Image exceeds 5 MiB' : 'Invalid image data',
        }, { status: errorStatus })
    }

    try {
        const items = await extractPantryItems(parsed.data)
        return Response.json({ items }, { status: 200 })
    } catch (error) {
        if (error instanceof PantryImportError) {
            const status = {
                invalid_source: 400,
                invalid_extraction: 502,
                rate_limited: 429,
                not_configured: 503,
                provider_failure: 503,
                timeout: 504,
            }[error.code]
            return Response.json({ error: 'Pantry extraction failed', code: error.code }, { status })
        }
        console.error('[pantry-extraction] unexpected failure', error)
        return Response.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
