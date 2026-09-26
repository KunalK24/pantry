import { createRecipe, getRecipe } from '@/services/recipe-service'
import { recipeInputSchema } from '@/schemas/recipe'

export async function POST(request: Request) {
    try {
        const input = await request.json()
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

        const recipe = await createRecipe(result.data)

        return Response.json(recipe, {
            status: 201,
        })
    } catch (error) {
        console.error(error)

        return Response.json(
            {
                status: 'error',
            },
            {
                status: 500,
            }
        )
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const name = searchParams.get('name')

        if (!name) {
            return Response.json({ status: 'error' }, { status: 400 })
        }

        const recipe = await getRecipe(name)

        return Response.json(recipe)
    } catch (error) {
        console.error(error)
        return Response.json({ status: 'error' }, { status: 500 })
    }
}
