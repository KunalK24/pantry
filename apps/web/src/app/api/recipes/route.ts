import { createRecipe } from '@/services/recipe-service'

export async function GET(request: Request) {
    try {
        const input = await request.json()

        const recipe = await createRecipe(input)

        return Response.json(recipe)
    } catch (error) {
        console.error(error)

        return Response.json(
            {
                status: "error",
            },
            {
                status: 500
            }
        )
    }
}