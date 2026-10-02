import { z } from 'zod'

function collapseWhitespace(value: string) {
    return value.trim().replace(/\s+/gu, ' ')
}

const pantryItemNameSchema = z
    .string()
    .transform(collapseWhitespace)
    .pipe(z.string().min(1))

const optionalTrimmedString = z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()

export const pantryItemInputSchema = z.object({
    name: pantryItemNameSchema,
    quantity: optionalTrimmedString,
    unit: optionalTrimmedString,
})

export type PantryItemInput = z.infer<typeof pantryItemInputSchema>

export const pantryItemIdSchema = z.cuid()
