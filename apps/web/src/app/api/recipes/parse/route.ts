import { recipeInputRequestSchema } from '@/schemas/recipe'
import { requireAuth } from '@/lib/auth'
import {
    importRecipe,
    RecipeImportError,
    RecipeImportErrorCode,
} from '@/services/recipe-import-service'

const errorResponses: Record<RecipeImportErrorCode, { message: string; status: number }> = {
    invalid_extraction: {
        message: 'The recipe source could not be converted into a valid recipe',
        status: 422,
    },
    invalid_source: {
        message: 'Invalid recipe import source',
        status: 400,
    },
    rate_limited: {
        message: 'Recipe import is temporarily rate limited',
        status: 429,
    },
    not_configured: {
        message: 'Recipe import is not configured',
        status: 503,
    },
    provider_failure: {
        message: 'Recipe import provider is unavailable',
        status: 502,
    },
    timeout: {
        message: 'Recipe import provider timed out',
        status: 504,
    },
}

export async function POST(request: Request) {
    const auth = await requireAuth(request)

    if (auth.response) {
        return auth.response
    }

    let input: unknown

    try {
        input = await request.json()
    } catch {
        return Response.json({ error: 'Malformed JSON' }, { status: 400 })
    }

    const result = recipeInputRequestSchema.safeParse(input)

    if (!result.success) {
        return Response.json(
            {
                error: 'Invalid recipe import request',
                details: result.error.flatten(),
            },
            { status: 400 },
        )
    }

    try {
        const draft = await importRecipe(result.data)

        return Response.json({ draft }, { status: 200 })
    } catch (error) {
        if (error instanceof RecipeImportError) {
            const response = errorResponses[error.code]

            return Response.json({ error: response.message }, { status: response.status })
        }

        console.error('Unexpected recipe import error')
        return Response.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
