import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findWeeklyPlanMock,
  transactionMock,
  countRecipesMock,
  createWeeklyPlanMock,
  updateWeeklyPlanMock,
  findPlanIdMock,
  deleteMealsMock,
  createMealsMock,
  findSavedWeeklyPlanMock,
} = vi.hoisted(() => ({
  findWeeklyPlanMock: vi.fn(),
  transactionMock: vi.fn(),
  countRecipesMock: vi.fn(),
  createWeeklyPlanMock: vi.fn(),
  updateWeeklyPlanMock: vi.fn(),
  findPlanIdMock: vi.fn(),
  deleteMealsMock: vi.fn(),
  createMealsMock: vi.fn(),
  findSavedWeeklyPlanMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    weeklyPlan: {
      findUnique: findWeeklyPlanMock,
    },
    $transaction: transactionMock,
  },
}));

import { Prisma } from "@/generated/prisma/client";
import {
  getWeeklyPlan,
  saveWeeklyPlan,
  WeeklyPlanReferenceError,
  WeeklyPlanRevisionConflictError,
} from "@/services/weekly-plan-service";

const recipeId = "cm12345678901234567890123";
const secondRecipeId = "cm22345678901234567890123";
const planId = "cm32345678901234567890123";
const mealId = "cm42345678901234567890123";
const userId = "cm52345678901234567890123";
const weekStart = "2026-09-28";
const weekStartDate = new Date("2026-09-28T00:00:00.000Z");
const updatedAt = new Date("2026-10-01T12:00:00.000Z");
const persistedPlan = {
  id: planId,
  weekStart: weekStartDate,
  revision: 0,
  updatedAt,
  meals: [
    {
      id: mealId,
      recipeId,
      dayOffset: 0,
      position: 0,
      mealSlot: null,
    },
  ],
};

const weeklyPlanSelect = {
  id: true,
  weekStart: true,
  revision: true,
  updatedAt: true,
  meals: {
    orderBy: [{ dayOffset: "asc" }, { position: "asc" }],
    select: {
      id: true,
      recipeId: true,
      dayOffset: true,
      position: true,
      mealSlot: true,
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  transactionMock.mockImplementation(async (operation) =>
    operation({
      recipe: {
        count: countRecipesMock,
      },
      weeklyPlan: {
        create: createWeeklyPlanMock,
        updateMany: updateWeeklyPlanMock,
        findUniqueOrThrow: vi.fn().mockImplementation((query) =>
          Object.keys(query.select).length === 1 ? findPlanIdMock(query) : findSavedWeeklyPlanMock(query)),
      },
      plannedMeal: {
        deleteMany: deleteMealsMock,
        createMany: createMealsMock,
      },
    }),
  );
});

describe("getWeeklyPlan", () => {
  it("returns a serialized plan with ordered meals", async () => {
    findWeeklyPlanMock.mockResolvedValue(persistedPlan);

    await expect(getWeeklyPlan(userId, weekStart)).resolves.toEqual({
      ...persistedPlan,
      weekStart,
    });
    expect(findWeeklyPlanMock).toHaveBeenCalledWith({
      where: {
        userId_weekStart: {
          userId,
          weekStart: weekStartDate,
        },
      },
      select: weeklyPlanSelect,
    });
  });

  it("returns null for an uncreated week", async () => {
    findWeeklyPlanMock.mockResolvedValue(null);

    await expect(getWeeklyPlan(userId, weekStart)).resolves.toBeNull();
  });
});

describe("saveWeeklyPlan", () => {
  it("atomically replaces meals and permits repeated recipes", async () => {
    const input = {
      expectedRevision: null,
      meals: [
        { recipeId, dayOffset: 0, position: 0, mealSlot: "breakfast" as const },
        { recipeId, dayOffset: 2, position: 0, mealSlot: "lunch" as const },
        { recipeId: secondRecipeId, dayOffset: 2, position: 1, mealSlot: "dinner" as const },
      ],
    };
    countRecipesMock.mockResolvedValue(2);
    createWeeklyPlanMock.mockResolvedValue({ id: planId });
    findSavedWeeklyPlanMock.mockResolvedValue(persistedPlan);

    await expect(saveWeeklyPlan(userId, weekStart, input)).resolves.toEqual({
      ...persistedPlan,
      weekStart,
    });

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(countRecipesMock).toHaveBeenCalledWith({
      where: { userId, id: { in: [recipeId, secondRecipeId] } },
    });
    expect(createWeeklyPlanMock).toHaveBeenCalledWith({
      data: { userId, weekStart: weekStartDate },
      select: { id: true },
    });
    expect(deleteMealsMock).toHaveBeenCalledWith({
      where: { weeklyPlanId: planId },
    });
    expect(createMealsMock).toHaveBeenCalledWith({
      data: input.meals.map((meal) => ({ weeklyPlanId: planId, ...meal })),
    });
    expect(findSavedWeeklyPlanMock).toHaveBeenCalledWith({
      where: { id: planId },
      select: weeklyPlanSelect,
    });
  });

  it("saves an empty week without unnecessary reference or create queries", async () => {
    createWeeklyPlanMock.mockResolvedValue({ id: planId });
    findSavedWeeklyPlanMock.mockResolvedValue({ ...persistedPlan, meals: [] });

    await saveWeeklyPlan(userId, weekStart, { expectedRevision: null, meals: [] });

    expect(countRecipesMock).not.toHaveBeenCalled();
    expect(createMealsMock).not.toHaveBeenCalled();
    expect(deleteMealsMock).toHaveBeenCalledOnce();
  });

  it("rejects an unknown recipe before replacing the plan", async () => {
    countRecipesMock.mockResolvedValue(0);

    await expect(
      saveWeeklyPlan(userId, weekStart, {
        expectedRevision: null,
        meals: [{ recipeId, dayOffset: 0, position: 0 }],
      }),
    ).rejects.toBeInstanceOf(WeeklyPlanReferenceError);

    expect(createWeeklyPlanMock).not.toHaveBeenCalled();
    expect(deleteMealsMock).not.toHaveBeenCalled();
  });

  it("translates a foreign-key race to a safe reference error", async () => {
    countRecipesMock.mockResolvedValue(1);
    createWeeklyPlanMock.mockResolvedValue({ id: planId });
    deleteMealsMock.mockResolvedValue({ count: 0 });
    createMealsMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Foreign key failed", {
        code: "P2003",
        clientVersion: "7.10.0",
      }),
    );

    await expect(
      saveWeeklyPlan(userId, weekStart, {
        expectedRevision: null,
        meals: [{ recipeId, dayOffset: 0, position: 0 }],
      }),
    ).rejects.toBeInstanceOf(WeeklyPlanReferenceError);
  });

  it("updates an existing week only at the loaded revision", async () => {
    updateWeeklyPlanMock.mockResolvedValue({ count: 1 });
    findPlanIdMock.mockResolvedValue({ id: planId });
    findSavedWeeklyPlanMock.mockResolvedValue({ ...persistedPlan, revision: 4 });

    await expect(saveWeeklyPlan(userId, weekStart, { expectedRevision: 3, meals: [] }))
      .resolves.toMatchObject({ revision: 4 });
    expect(updateWeeklyPlanMock).toHaveBeenCalledWith({
      where: { userId, weekStart: weekStartDate, revision: 3 },
      data: { revision: { increment: 1 }, updatedAt: expect.any(Date) },
    });
  });

  it("rejects a stale week before replacing meals", async () => {
    updateWeeklyPlanMock.mockResolvedValue({ count: 0 });
    await expect(saveWeeklyPlan(userId, weekStart, { expectedRevision: 2, meals: [] }))
      .rejects.toBeInstanceOf(WeeklyPlanRevisionConflictError);
    expect(deleteMealsMock).not.toHaveBeenCalled();
  });

  it("rejects creating a week that another client already created", async () => {
    createWeeklyPlanMock.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique failed", {
      code: "P2002", clientVersion: "7.10.0",
    }));
    await expect(saveWeeklyPlan(userId, weekStart, { expectedRevision: null, meals: [] }))
      .rejects.toBeInstanceOf(WeeklyPlanRevisionConflictError);
    expect(deleteMealsMock).not.toHaveBeenCalled();
  });
});
