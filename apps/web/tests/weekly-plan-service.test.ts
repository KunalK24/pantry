import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    findWeeklyPlanMock,
    transactionMock,
    countRecipesMock,
    upsertWeeklyPlanMock,
    deleteMealsMock,
    createMealsMock,
    findSavedWeeklyPlanMock,
} = vi.hoisted(() => ({
    findWeeklyPlanMock: vi.fn(),
    transactionMock: vi.fn(),
    countRecipesMock: vi.fn(),
    upsertWeeklyPlanMock: vi.fn(),
    deleteMealsMock: vi.fn(),
    createMealsMock: vi.fn(),
    findSavedWeeklyPlanMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        weeklyPlan: {
            findUnique: findWeeklyPlanMock,
        },
        $transaction: transactionMock,
    },
}))

import { Prisma } from '@/generated/prisma/client'
import {
    getWeeklyPlan,
    saveWeeklyPlan,
    WeeklyPlanReferenceError,
} from '@/services/weekly-plan-service'

const recipeId = 'cm12345678901234567890123'
const secondRecipeId = 'cm22345678901234567890123'
const planId = 'cm32345678901234567890123'
const mealId = 'cm42345678901234567890123'
const weekStart = '2026-09-28'
const weekStartDate = new Date('2026-09-28T00:00:00.000Z')
const updatedAt = new Date('2026-10-01T12:00:00.000Z')
const persistedPlan = {
    id: planId,
    weekStart: weekStartDate,
    updatedAt,
    meals: [{
        id: mealId,
        recipeId,
        dayOffset: 0,
        position: 0,
    }],
}

const weeklyPlanSelect = {
    id: true,
    weekStart: true,
    updatedAt: true,
    meals: {
        orderBy: [
            { dayOffset: 'asc' },
            { position: 'asc' },
        ],
        select: {
            id: true,
            recipeId: true,
            dayOffset: true,
            position: true,
        },
    },
}

beforeEach(() => {
    vi.clearAllMocks()
    transactionMock.mockImplementation(async (operation) => operation({
        recipe: {
            count: countRecipesMock,
        },
        weeklyPlan: {
            upsert: upsertWeeklyPlanMock,
            findUniqueOrThrow: findSavedWeeklyPlanMock,
        },
        plannedMeal: {
            deleteMany: deleteMealsMock,
            createMany: createMealsMock,
        },
    }))
})

describe('getWeeklyPlan', () => {
    it('returns a serialized plan with ordered meals', async () => {
        findWeeklyPlanMock.mockResolvedValue(persistedPlan)

        await expect(getWeeklyPlan(weekStart)).resolves.toEqual({
            ...persistedPlan,
            weekStart,
        })
        expect(findWeeklyPlanMock).toHaveBeenCalledWith({
            where: { weekStart: weekStartDate },
            select: weeklyPlanSelect,
        })
    })

    it('returns null for an uncreated week', async () => {
        findWeeklyPlanMock.mockResolvedValue(null)

        await expect(getWeeklyPlan(weekStart)).resolves.toBeNull()
    })
})

describe('saveWeeklyPlan', () => {
    it('atomically replaces meals and permits repeated recipes', async () => {
        const input = {
            meals: [
                { recipeId, dayOffset: 0, position: 0 },
                { recipeId, dayOffset: 2, position: 0 },
                { recipeId: secondRecipeId, dayOffset: 2, position: 1 },
            ],
        }
        countRecipesMock.mockResolvedValue(2)
        upsertWeeklyPlanMock.mockResolvedValue({ id: planId })
        findSavedWeeklyPlanMock.mockResolvedValue(persistedPlan)

        await expect(saveWeeklyPlan(weekStart, input)).resolves.toEqual({
            ...persistedPlan,
            weekStart,
        })

        expect(transactionMock).toHaveBeenCalledOnce()
        expect(countRecipesMock).toHaveBeenCalledWith({
            where: { id: { in: [recipeId, secondRecipeId] } },
        })
        expect(upsertWeeklyPlanMock).toHaveBeenCalledWith({
            where: { weekStart: weekStartDate },
            create: { weekStart: weekStartDate },
            update: { updatedAt: expect.any(Date) },
            select: { id: true },
        })
        expect(deleteMealsMock).toHaveBeenCalledWith({
            where: { weeklyPlanId: planId },
        })
        expect(createMealsMock).toHaveBeenCalledWith({
            data: input.meals.map((meal) => ({ weeklyPlanId: planId, ...meal })),
        })
        expect(findSavedWeeklyPlanMock).toHaveBeenCalledWith({
            where: { id: planId },
            select: weeklyPlanSelect,
        })
    })

    it('saves an empty week without unnecessary reference or create queries', async () => {
        upsertWeeklyPlanMock.mockResolvedValue({ id: planId })
        findSavedWeeklyPlanMock.mockResolvedValue({ ...persistedPlan, meals: [] })

        await saveWeeklyPlan(weekStart, { meals: [] })

        expect(countRecipesMock).not.toHaveBeenCalled()
        expect(createMealsMock).not.toHaveBeenCalled()
        expect(deleteMealsMock).toHaveBeenCalledOnce()
    })

    it('rejects an unknown recipe before replacing the plan', async () => {
        countRecipesMock.mockResolvedValue(0)

        await expect(saveWeeklyPlan(weekStart, {
            meals: [{ recipeId, dayOffset: 0, position: 0 }],
        })).rejects.toBeInstanceOf(WeeklyPlanReferenceError)

        expect(upsertWeeklyPlanMock).not.toHaveBeenCalled()
        expect(deleteMealsMock).not.toHaveBeenCalled()
    })

    it('translates a foreign-key race to a safe reference error', async () => {
        countRecipesMock.mockResolvedValue(1)
        upsertWeeklyPlanMock.mockResolvedValue({ id: planId })
        deleteMealsMock.mockResolvedValue({ count: 0 })
        createMealsMock.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
            'Foreign key failed',
            { code: 'P2003', clientVersion: '7.10.0' },
        ))

        await expect(saveWeeklyPlan(weekStart, {
            meals: [{ recipeId, dayOffset: 0, position: 0 }],
        })).rejects.toBeInstanceOf(WeeklyPlanReferenceError)
    })
})
