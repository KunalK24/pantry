import {
    pantryItemIdSchema,
    pantryItemInputSchema,
} from '@/schemas/pantry-item'
import {
    deletePantryItem,
    getPantryItemById,
    PantryItemConflictError,
    PantryItemNotFoundError,
    updatePantryItem,
} from '@/services/pantry-item-service'

type PantryItemRouteContext = {
    params: Promise<{
        id: string
    }>
}

function invalidPantryItemIdResponse() {
    return Response.json(
        {
            error: 'Invalid pantry item ID',
        },
        {
            status: 400,
        }
    )
}

function pantryItemNotFoundResponse() {
    return Response.json(
        {
            error: 'Pantry item not found',
        },
        {
            status: 404,
        }
    )
}

function pantryItemConflictResponse() {
    return Response.json(
        {
            error: 'Pantry item already exists',
        },
        {
            status: 409,
        }
    )
}

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

export async function GET(_request: Request, context: PantryItemRouteContext) {
    const { id } = await context.params
    const idResult = pantryItemIdSchema.safeParse(id)

    if (!idResult.success) {
        return invalidPantryItemIdResponse()
    }

    try {
        const item = await getPantryItemById(idResult.data)

        return Response.json(item)
    } catch (error) {
        if (error instanceof PantryItemNotFoundError) {
            return pantryItemNotFoundResponse()
        }

        return internalServerErrorResponse(error)
    }
}

export async function PUT(request: Request, context: PantryItemRouteContext) {
    const { id } = await context.params
    const idResult = pantryItemIdSchema.safeParse(id)

    if (!idResult.success) {
        return invalidPantryItemIdResponse()
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
        const item = await updatePantryItem(idResult.data, result.data)

        return Response.json(item)
    } catch (error) {
        if (error instanceof PantryItemNotFoundError) {
            return pantryItemNotFoundResponse()
        }

        if (error instanceof PantryItemConflictError) {
            return pantryItemConflictResponse()
        }

        return internalServerErrorResponse(error)
    }
}

export async function DELETE(_request: Request, context: PantryItemRouteContext) {
    const { id } = await context.params
    const idResult = pantryItemIdSchema.safeParse(id)

    if (!idResult.success) {
        return invalidPantryItemIdResponse()
    }

    try {
        const item = await deletePantryItem(idResult.data)

        return Response.json(item, {
            status: 200,
        })
    } catch (error) {
        if (error instanceof PantryItemNotFoundError) {
            return pantryItemNotFoundResponse()
        }

        return internalServerErrorResponse(error)
    }
}