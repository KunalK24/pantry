import { z } from "zod";

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

const pantryItemNameSchema = z
  .string()
  .transform(collapseWhitespace)
  .pipe(z.string().min(1).max(200));

export const pantryItemLocationSchema = z.enum([
  "Fridge",
  "Pantry",
  "Cupboard",
  "Freezer",
  "Spice Cabinet",
]);

const expirationDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date in YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Expected a valid calendar date");

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
  location: pantryItemLocationSchema.nullable().optional(),
  expiresOn: expirationDateSchema.nullable().optional(),
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
