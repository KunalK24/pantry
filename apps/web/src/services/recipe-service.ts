import { prisma } from '@/lib/prisma'
import { CreateRecipeInput } from '@/types/recipe'

export async function createRecipe(input: CreateRecipeInput) {
    return prisma.recipe.create({
        data: {
            name: input.name,
        }
    })
}