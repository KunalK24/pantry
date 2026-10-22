import { z } from 'zod'
import { recipeInputRequestSchema } from './recipe';

export const createAiJobRequestSchema = z.object({
  jobType: z.literal("recipe_import"),
  input: recipeInputRequestSchema,
});

export type CreateAIJobInput = z.infer<typeof createAiJobRequestSchema>

export const aiJobIdSchema = z.cuid()
