import { createRecipe, listRecipes } from '@/services/recipe-service'
import { recipeInputSchema } from '@/schemas/recipe'

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

    const result = recipeInputSchema.safeParse(input)

    if (!result.success) {
        return Response.json(
            {
                error: 'Invalid Recipe',
                details: result.error.flatten()
            },
            {
                status: 400,
            }
        )
    }

    try {
        const recipe = await createRecipe(result.data)

        return Response.json(recipe, {
            status: 201,
        })
    } catch (error) {
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
}

export async function GET() {
    try {
        const recipes = await listRecipes()

        return Response.json({ recipes })
    } catch (error) {
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
}
