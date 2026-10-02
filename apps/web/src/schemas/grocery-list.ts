import { z } from 'zod'

const requiredString = (maximum: number) => z.string().trim().min(1).max(maximum)
const optionalValue = (maximum: number) => z.string().trim().max(maximum).nullable()

const groceryListRecipeInputSchema = z.object({
    recipeId: z.cuid(),
    source: z.enum(['MANUAL', 'WEEKLY_PLAN']),
})

const groceryItemInputSchema = z.object({
    lineKey: requiredString(500),
    name: requiredString(200),
    baseQuantity: z.string().trim().max(100),
    baseUnit: z.string().trim().max(100),
    quantityOverride: optionalValue(100),
    unitOverride: optionalValue(100),
    checked: z.boolean(),
    dismissed: z.boolean(),
    pantryItemId: z.cuid().nullable(),
})

export const groceryListInputSchema = z.object({
    importedWeeklyPlanId: z.cuid().nullable(),
    recipes: z.array(groceryListRecipeInputSchema),
    items: z.array(groceryItemInputSchema),
}).superRefine(({ items }, context) => {
    const lineKeys = new Set<string>()

    items.forEach((item, index) => {
        if (lineKeys.has(item.lineKey)) {
            context.addIssue({
                code: 'custom',
                message: 'Grocery item line keys must be unique',
                path: ['items', index, 'lineKey'],
            })
        }

        lineKeys.add(item.lineKey)
    })
})

export type GroceryListInput = z.infer<typeof groceryListInputSchema>
