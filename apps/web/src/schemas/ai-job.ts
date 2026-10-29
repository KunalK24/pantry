import { z } from "zod";
import { recipeInputRequestSchema } from "./recipe";
import { pantryExtractionRequestSchema } from "./pantry-item";

export const createAiJobRequestSchema = z.discriminatedUnion("jobType", [
  z.object({
    jobType: z.literal("recipe_import"),
    input: recipeInputRequestSchema,
  }),
  z.object({
    jobType: z.literal("pantry_import"),
    input: pantryExtractionRequestSchema,
  }),
]);

export type CreateAIJobInput = z.infer<typeof createAiJobRequestSchema>;

export const aiJobIdSchema = z.cuid();
