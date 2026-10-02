import { z } from 'zod'

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u

function parseCalendarDate(value: string) {
    const match = datePattern.exec(value)

    if (!match) {
        return null
    }

    const [, yearText, monthText, dayText] = match
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const date = new Date(Date.UTC(year, month - 1, day))

    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null
    }

    return date
}

export const weekStartSchema = z.string().superRefine((value, context) => {
    const date = parseCalendarDate(value)

    if (!date || date.getUTCDay() !== 1) {
        context.addIssue({
            code: 'custom',
            message: 'Week start must be a valid Monday in YYYY-MM-DD format',
        })
    }
})

export function weekStartToDate(weekStart: string) {
    const result = weekStartSchema.safeParse(weekStart)

    if (!result.success) {
        throw new Error('Invalid week start')
    }

    return parseCalendarDate(result.data) as Date
}

export function formatWeekStart(date: Date) {
    return date.toISOString().slice(0, 10)
}

const plannedMealInputSchema = z.object({
    recipeId: z.cuid(),
    dayOffset: z.number().int().min(0).max(6),
    position: z.number().int().nonnegative(),
})

export const weeklyPlanInputSchema = z.object({
    meals: z.array(plannedMealInputSchema),
}).superRefine(({ meals }, context) => {
    const positionsByDay = new Map<number, Set<number>>()

    meals.forEach((meal, index) => {
        const positions = positionsByDay.get(meal.dayOffset) ?? new Set<number>()

        if (positions.has(meal.position)) {
            context.addIssue({
                code: 'custom',
                message: 'Meal positions must be unique within each day',
                path: ['meals', index, 'position'],
            })
        }

        positions.add(meal.position)
        positionsByDay.set(meal.dayOffset, positions)
    })

    for (const [dayOffset, positions] of positionsByDay) {
        const orderedPositions = [...positions].sort((left, right) => left - right)

        orderedPositions.forEach((position, index) => {
            if (position !== index) {
                context.addIssue({
                    code: 'custom',
                    message: 'Meal positions must be contiguous within each day',
                    path: ['meals', meals.findIndex((meal) => (
                        meal.dayOffset === dayOffset && meal.position === position
                    )), 'position'],
                })
            }
        })
    }
})

export type WeeklyPlanInput = z.infer<typeof weeklyPlanInputSchema>
