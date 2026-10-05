import { recipeIdSchema, recipeInputSchema } from '@/schemas/recipe'
import {
    getRecipeById,
    RecipeNotFoundError,
    updateRecipe,
    deleteRecipe,
} from '@/services/recipe-service'

type RecipeRouteContext = {
    params: Promise<{
        id: string
    }>
}

function invalidRecipeIdResponse() {
    return Response.json(
        {
            error: 'Invalid recipe ID',
        },
        {
            status: 400,
        }
    )
}

function recipeNotFoundResponse() {
    return Response.json(
        {
            error: 'Recipe not found',
        },
        {
            status: 404,
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

export async function GET(_request: Request, context: RecipeRouteContext) {
    const { id } = await context.params
    const idResult = recipeIdSchema.safeParse(id)

    if (!idResult.success) {
        return invalidRecipeIdResponse()
    }

    try {
        const recipe = await getRecipeById(idResult.data)

        return Response.json(recipe)
    } catch (error) {
        if (error instanceof RecipeNotFoundError) {
            return recipeNotFoundResponse()
        }

        return internalServerErrorResponse(error)
    }
}

export async function PUT(request: Request, context: RecipeRouteContext) {
    const { id } = await context.params
    const idResult = recipeIdSchema.safeParse(id)

    if (!idResult.success) {
        return invalidRecipeIdResponse()
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

    const result = recipeInputSchema.safeParse(input)

    if (!result.success) {
        return Response.json(
            {
                error: 'Invalid Recipe',
                details: result.error.flatten(),
            },
            {
                status: 400,
            }
        )
    }

    try {
        const recipe = await updateRecipe(idResult.data, result.data)

        return Response.json(recipe)
    } catch (error) {
        if (error instanceof RecipeNotFoundError) {
            return recipeNotFoundResponse()
        }

        return internalServerErrorResponse(error)
    }
}

export async function DELETE(_request: Request, context: RecipeRouteContext) {
    const { id } = await context.params
    const idResult = recipeIdSchema.safeParse(id)

    if (!idResult.success) {
        return invalidRecipeIdResponse()
    }

    try {
        const recipe = await deleteRecipe(idResult.data)

        return Response.json(recipe, {
            status: 200,
        })
    } catch (error) {
        if (error instanceof RecipeNotFoundError) {
            return recipeNotFoundResponse()
        }

        return internalServerErrorResponse(error)
    }
}
