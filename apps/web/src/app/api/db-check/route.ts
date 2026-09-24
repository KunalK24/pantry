import { prisma } from "@/lib/prisma"

export async function GET() {
    try {
        const recipeCount = await prisma.recipe.count()

        return Response.json({
            status: "ok",
            recipeCount,
        })
    } catch (error) {
        console.error(error)

        return Response.json(
            {
                status: "error",
            },
            {
                status: 500,
            }
        )
    }
}
