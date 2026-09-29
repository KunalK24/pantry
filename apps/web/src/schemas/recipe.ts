import { z } from 'zod'

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
        const normalizedName = ingredient.name.toLowerCase()

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

export type RecipeInput = z.infer<typeof recipeInputSchema>
