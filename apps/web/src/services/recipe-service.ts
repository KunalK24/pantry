import { prisma } from '@/lib/prisma'
import { RecipeInput } from '@/schemas/recipe'

export async function createRecipe(input: RecipeInput) {
    return prisma.recipe.create({
        data: {
            name: input.name,
        }
    })
}

export async function getRecipe(name: string) {
    return prisma.recipe.findFirst({
        where: {
            name,
        }
    })
}