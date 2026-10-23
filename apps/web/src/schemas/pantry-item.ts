import { z } from "zod";

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

const pantryItemNameSchema = z
  .string()
  .transform(collapseWhitespace)
  .pipe(z.string().min(1).max(200));

export const pantryItemInputSchema = z.object({
  name: pantryItemNameSchema,
  quantity: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || undefined)
    .optional(),
  unit: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || undefined)
    .optional(),
});

export const pantryExtractionSchema = z.object({
  items: z.array(pantryItemInputSchema).max(100),
});

const pantryExtractionInput = z.object({
  type: z.literal("image"),
  image: z.object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    data: z.string().trim().min(1),
  }),
});

export const pantryExtractionRequestSchema = pantryExtractionInput;

export type PantryItemInput = z.infer<typeof pantryItemInputSchema>;

export type PantryExtraction = z.infer<typeof pantryExtractionSchema>;

export type PantryExtractionInput = z.infer<typeof pantryExtractionInput>;

export type PantryExtractionRequest = z.infer<
  typeof pantryExtractionRequestSchema
>;

export const pantryItemIdSchema = z.cuid();
