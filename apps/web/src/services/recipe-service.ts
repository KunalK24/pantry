import { prisma } from '@/lib/prisma'
import { RecipeInput } from '@/schemas/recipe'

export async function createRecipe(input: RecipeInput) {
    const recipe = await prisma.recipe.create({
        data: {
            name: input.name,
            description: input.description ?? null,
            instructions: input.instructions,
            ingredients: {
                create: input.ingredients.map((ingredient) => ({
                    quantity: ingredient.quantity,
                    unit: ingredient.unit ?? null,
                    ingredient: {
                        create: {
                            name: ingredient.name,
                        },
                    },
                })),
            },
        },
        include: {
            ingredients: {
                include: {
                    ingredient: true,
                },
            },
        },
    })

    return {
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        instructions: recipe.instructions,
        createdAt: recipe.createdAt,
        updatedAt: recipe.updatedAt,
        ingredients: recipe.ingredients.map((recipeIngredient) => ({
            name: recipeIngredient.ingredient.name,
            quantity: recipeIngredient.quantity,
            unit: recipeIngredient.unit,
        })),
    }
}

export async function getRecipe(name: string) {
    return prisma.recipe.findFirst({
        where: {
            name,
        }
    })
}
