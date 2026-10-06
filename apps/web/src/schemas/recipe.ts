import { z } from 'zod'

import { normalizeIngredientName } from '@/lib/ingredient-normalization'

const optionalTrimmedString = z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()

export const recipeInputSchema = z.object({
    name: z.string().trim().min(1),
    description: optionalTrimmedString,
    instructions: z.string().trim().min(1),
    ingredients: z.array(z.object({
        name: z.string().trim().min(1),
        quantity: z.string().trim().min(1),
        unit: optionalTrimmedString,
    })).min(1),
}).superRefine((recipe, context) => {
    const ingredientNames = new Set<string>()

    recipe.ingredients.forEach((ingredient, index) => {
        const normalizedName = normalizeIngredientName(ingredient.name)

        if (ingredientNames.has(normalizedName)) {
            context.addIssue({
                code: 'custom',
                message: 'Ingredient names must be unique within a recipe',
                path: ['ingredients', index, 'name'],
            })
        }

        ingredientNames.add(normalizedName)
    })
})

const typedRecipeInputRequestSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('text'),
        text: z.string().trim().min(1).max(20000),
    }),
    z.object({
        type: z.literal('image'),
        image: z.object({
            mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
            data: z.string().trim().min(1),
        }),
    }),
    z.object({
        type: z.literal('url'),
        url: z.string()
            .trim()
            .max(2048)
            .url()
            .refine((value) => {
                let protocol: string

                try {
                    protocol = new URL(value).protocol
                } catch {
                    return false
                }

                return protocol === 'http:' || protocol === 'https:'
            }, 'URL must use http or https'),
    }),
])

export const recipeInputRequestSchema = z.preprocess((value) => {
    if (
        typeof value === 'object'
        && value !== null
        && !('type' in value)
        && 'text' in value
    ) {
        return {
            ...value,
            type: 'text',
        }
    }

    return value
}, typedRecipeInputRequestSchema)

export const legacyRecipeInputRequestSchema = z.object({
    text: z.string().trim().min(1).max(20000),
})

export type RecipeInput = z.infer<typeof recipeInputSchema>

export type RecipeInputRequest = z.infer<typeof recipeInputRequestSchema>

export const recipeIdSchema = z.cuid()
