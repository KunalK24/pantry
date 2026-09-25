import { createRecipe, getRecipe } from '@/services/recipe-service'

export async function POST(request: Request) {
    try {
        const input = await request.json()
        const recipe = await createRecipe(input)

        return Response.json(recipe)
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