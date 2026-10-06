import { groceryListInputSchema } from '@/schemas/grocery-list'
import { currentUserId } from '@/lib/current-user'
import {
    clearActiveGroceryList,
    getActiveGroceryList,
    GroceryListReferenceError,
    saveActiveGroceryList,
} from '@/services/grocery-list-service'

function internalServerErrorResponse(error: unknown) {
    console.error(error)

    return Response.json(
        { error: 'Internal Server Error' },
        { status: 500 },
    )
}

export async function GET() {
    try {
        const list = await getActiveGroceryList(currentUserId)
        return Response.json({ list })
    } catch (error) {
        return internalServerErrorResponse(error)
    }
}

export async function PUT(request: Request) {
    let input: unknown

    try {
        input = await request.json()
    } catch {
        return Response.json(
            { error: 'Malformed JSON' },
            { status: 400 },
        )
    }

    const inputResult = groceryListInputSchema.safeParse(input)

    if (!inputResult.success) {
        return Response.json(
            {
                error: 'Invalid grocery list',
                details: inputResult.error.flatten(),
            },
            { status: 400 },
        )
    }

    try {
        const list = await saveActiveGroceryList(currentUserId, inputResult.data)
        return Response.json({ list })
    } catch (error) {
        if (error instanceof GroceryListReferenceError) {
            return Response.json(
                { error: 'Grocery list references an unknown record' },
                { status: 400 },
            )
        }

        return internalServerErrorResponse(error)
    }
}

export async function DELETE() {
    try {
        await clearActiveGroceryList(currentUserId)
        return new Response(null, { status: 204 })
    } catch (error) {
        return internalServerErrorResponse(error)
    }
}
