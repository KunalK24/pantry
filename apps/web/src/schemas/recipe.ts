import { z } from "zod";

import { hasValidPackageCorrection, ingredientDetailsFields } from "@/schemas/ingredient-details";

export const recipeInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z
      .string()
      .trim()
      .max(2000)
      .transform((value) => value || undefined)
      .optional(),
    instructions: z.array(z.string().trim().min(1).max(20000)).min(1).max(100)
      .refine((steps) => steps.reduce((length, step) => length + step.length, 0) <= 20000, {
        message: "Instructions must be 20000 characters or fewer in total",
      }),
    mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "dessert"]).nullable().optional(),
    timeMinutes: z.number().int().min(1).max(2_147_483_647).nullable().optional(),
    ingredients: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          quantity: z.string().trim().min(1).max(100),
          unit: z
            .string()
            .trim()
            .max(100)
            .transform((value) => value || undefined)
            .optional(),
          ...ingredientDetailsFields,
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((recipe, context) => {
    recipe.ingredients.forEach((ingredient, index) => {
      if (!hasValidPackageCorrection(ingredient)) {
        context.addIssue({
          code: "custom",
          message: "Package amount and unit must be supplied together",
          path: ["ingredients", index, "packageQuantity"],
        });
      }
    });
  });

const typedRecipeInputRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().trim().min(1).max(20000),
  }),
  z.object({
    type: z.literal("image"),
    image: z.object({
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      data: z.string().trim().min(1),
    }),
  }),
  z.object({
    type: z.literal("url"),
    url: z
      .string()
      .trim()
      .max(2048)
      .url()
      .refine((value) => {
        let protocol: string;

        try {
          protocol = new URL(value).protocol;
        } catch {
          return false;
        }

        return protocol === "http:" || protocol === "https:";
      }, "URL must use http or https"),
  }),
]);

export const recipeInputRequestSchema = z.preprocess((value) => {
  if (
    typeof value === "object" &&
    value !== null &&
    !("type" in value) &&
    "text" in value
  ) {
    return {
      ...value,
      type: "text",
    };
  }

  return value;
}, typedRecipeInputRequestSchema);

export type RecipeInput = z.infer<typeof recipeInputSchema>;

export const recipeFavoriteSchema = z.object({
  isFavorite: z.boolean(),
}).strict();

export type RecipeInputRequest = z.infer<typeof recipeInputRequestSchema>;

export const recipeIdSchema = z.cuid();
