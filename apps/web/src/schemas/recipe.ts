import { z } from 'zod'

export const recipeInputSchema = z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
})

export type RecipeInput = z.infer<typeof recipeInputSchema>