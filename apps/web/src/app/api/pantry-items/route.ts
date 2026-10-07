import { pantryItemInputSchema } from '@/schemas/pantry-item'
import { requireAuth } from '@/lib/auth'
import {
    createPantryItem,
    listPantryItems,
    PantryItemConflictError,
} from '@/services/pantry-item-service'

function internalServerErrorResponse(error: unknown) {
    console.error(error)

    return Response.json(
        {
            error: 'Internal Server Error',
        },
        {
            status: 500,
        }
    )
}

export async function GET(request: Request) {
    const auth = await requireAuth(request)

    if (auth.response) {
        return auth.response
    }

    try {
        const items = await listPantryItems(auth.user.id)

        return Response.json({ items })
    } catch (error) {
        return internalServerErrorResponse(error)
    }
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
        return Response.json(
            {
                error: 'Malformed JSON',
            },
            {
                status: 400,
            }
        )
    }

    const result = pantryItemInputSchema.safeParse(input)

    if (!result.success) {
        return Response.json(
            {
                error: 'Invalid pantry item',
                details: result.error.flatten(),
            },
            {
                status: 400,
            }
        )
    }

    try {
        const item = await createPantryItem(auth.user.id, result.data)

        return Response.json(item, {
            status: 201,
        })
    } catch (error) {
        if (error instanceof PantryItemConflictError) {
            return Response.json(
                {
                    error: 'Pantry item already exists',
                },
                {
                    status: 409,
                }
            )
        }

        return internalServerErrorResponse(error)
    }
}
