import { prisma } from '@/lib/prisma'
import { RecipeInput } from '@/schemas/recipe'
import { Prisma } from '@/generated/prisma/client'

const recipeWithIngredients = {
    ingredients: {
        include: {
            ingredient: true,
        },
    },
} as const

type CompleteRecipe = Prisma.RecipeGetPayload<{
    include: typeof recipeWithIngredients
}>

function flattenRecipe(recipe: CompleteRecipe) {
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

function ingredientCreates(input: RecipeInput) {
    return input.ingredients.map((ingredient) => ({
        quantity: ingredient.quantity,
        unit: ingredient.unit ?? null,
        ingredient: {
            create: {
                name: ingredient.name,
            },
        },
    }))
}

export class RecipeNotFoundError extends Error {
    constructor(recipeId: string) {
        super(`Recipe ${recipeId} was not found`)
        this.name = 'RecipeNotFoundError'
    }
}

export async function createRecipe(input: RecipeInput) {
    const recipe = await prisma.recipe.create({
        data: {
            name: input.name,
            description: input.description ?? null,
            instructions: input.instructions,
            ingredients: {
                create: ingredientCreates(input),
            },
        },
        include: recipeWithIngredients,
    })

    return flattenRecipe(recipe)
}

export async function getRecipe(name: string) {
    return prisma.recipe.findFirst({
        where: {
            name,
        }
    })
}

export async function listRecipes() {
    return prisma.recipe.findMany({
        orderBy: {
            updatedAt: 'desc',
        },
        select: {
            id: true,
            name: true,
            description: true,
            updatedAt: true,
        },
    })
}

export async function getRecipeById(id: string) {
    const recipe = await prisma.recipe.findUnique({
        where: {
            id,
        },
        include: recipeWithIngredients,
    })

    if (!recipe) {
        throw new RecipeNotFoundError(id)
    }

    return flattenRecipe(recipe)
}

export async function updateRecipe(id: string, input: RecipeInput) {
    try {
        return await prisma.$transaction(async (transaction) => {
            const existingRecipe = await transaction.recipe.findUnique({
                where: {
                    id,
                },
                select: {
                    ingredients: {
                        select: {
                            ingredientId: true,
                        },
                    },
                },
            })

            if (!existingRecipe) {
                throw new RecipeNotFoundError(id)
            }

            const oldIngredientIds = existingRecipe.ingredients.map(
                ({ ingredientId }) => ingredientId,
            )

            await transaction.recipe.update({
                where: {
                    id,
                },
                data: {
                    name: input.name,
                    description: input.description ?? null,
                    instructions: input.instructions,
                },
            })

            await transaction.recipeIngredient.deleteMany({
                where: {
                    recipeId: id,
                },
            })

            const recipe = await transaction.recipe.update({
                where: {
                    id,
                },
                data: {
                    ingredients: {
                        create: ingredientCreates(input),
                    },
                },
                include: recipeWithIngredients,
            })

            if (oldIngredientIds.length > 0) {
                await transaction.ingredient.deleteMany({
                    where: {
                        id: {
                            in: oldIngredientIds,
                        },
                        recipes: {
                            none: {},
                        },
                    },
                })
            }

            return flattenRecipe(recipe)
        })
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError
            && error.code === 'P2025'
        ) {
            throw new RecipeNotFoundError(id)
        }

        throw error
    }
}
