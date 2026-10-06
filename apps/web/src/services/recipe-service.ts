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

function isKnownPrismaError(error: unknown, code: string) {
    return error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === code
}

export async function createRecipe(userId: string, input: RecipeInput) {
    const recipe = await prisma.recipe.create({
        data: {
            userId,
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

export async function listRecipes(userId: string) {
    const recipes = await prisma.recipe.findMany({
        where: {
            userId,
        },
        orderBy: {
            updatedAt: 'desc',
        },
        select: {
            id: true,
            name: true,
            description: true,
            updatedAt: true,
            ingredients: {
                select: {
                    quantity: true,
                    unit: true,
                    ingredient: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
        },
    })

    return recipes.map(({ ingredients, ...recipe }) => ({
        ...recipe,
        ingredients: ingredients.map((recipeIngredient) => ({
            name: recipeIngredient.ingredient.name,
            quantity: recipeIngredient.quantity,
            unit: recipeIngredient.unit,
        })),
    }))
}

export async function getRecipeById(userId: string, id: string) {
    const recipe = await prisma.recipe.findUnique({
        where: {
            id,
            userId,
        },
        include: recipeWithIngredients,
    })

    if (!recipe) {
        throw new RecipeNotFoundError(id)
    }

    return flattenRecipe(recipe)
}

export async function updateRecipe(userId: string, id: string, input: RecipeInput) {
    try {
        return await prisma.$transaction(async (transaction) => {
            const existingRecipe = await transaction.recipe.findUnique({
                where: {
                    id,
                    userId,
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

            const recipe = await transaction.recipe.update({
                where: {
                    id,
                    userId,
                },
                data: {
                    name: input.name,
                    description: input.description ?? null,
                    instructions: input.instructions,
                    ingredients: {
                        deleteMany: {},
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

export async function deleteRecipe(userId: string, id: string) {
    try {
        return await prisma.$transaction(async (transaction) => {
            const recipe = await transaction.recipe.findUnique({
                where: {
                    id,
                    userId,
                },
                include: recipeWithIngredients,
            })

            if (!recipe) {
                throw new RecipeNotFoundError(id)
            }

            const ingredientIds = recipe.ingredients.map(
                ({ ingredientId }) => ingredientId,
            )

            await transaction.recipeIngredient.deleteMany({
                where: {
                    recipeId: id,
                },
            })

            await transaction.recipe.delete({
                where: {
                    id,
                    userId,
                },
            })

            if (ingredientIds.length > 0) {
                await transaction.ingredient.deleteMany({
                    where: {
                        id: {
                            in: ingredientIds,
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
        if (isKnownPrismaError(error, 'P2025')) {
            throw new RecipeNotFoundError(id)
        }

        throw error
    }
}
