import { pantryItemInputSchema } from '@/schemas/pantry-item'
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

export async function GET() {
    try {
        const items = await listPantryItems()

        return Response.json({ items })
    } catch (error) {
        return internalServerErrorResponse(error)
    }
}

export async function POST(request: Request) {
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
        const item = await createPantryItem(result.data)

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
