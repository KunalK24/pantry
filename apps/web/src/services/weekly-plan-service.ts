import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  formatWeekStart,
  type WeeklyPlanInput,
  weekStartToDate,
} from "@/schemas/weekly-plan";

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
} satisfies Prisma.WeeklyPlanSelect;

type WeeklyPlanRecord = Prisma.WeeklyPlanGetPayload<{
  select: typeof weeklyPlanSelect;
}>;

export class WeeklyPlanReferenceError extends Error {
  constructor() {
    super("Weekly plan references an unknown recipe");
    this.name = "WeeklyPlanReferenceError";
  }
}

export class WeeklyPlanRevisionConflictError extends Error {
  constructor() {
    super("Weekly plan changed since it was loaded");
    this.name = "WeeklyPlanRevisionConflictError";
  }
}

function serializeWeeklyPlan(plan: WeeklyPlanRecord) {
  return {
    ...plan,
    weekStart: formatWeekStart(plan.weekStart),
  };
}

function isForeignKeyError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

export async function getWeeklyPlan(userId: string, weekStart: string) {
  const plan = await prisma.weeklyPlan.findUnique({
    where: {
      userId_weekStart: {
        userId,
        weekStart: weekStartToDate(weekStart),
      },
    },
    select: weeklyPlanSelect,
  });

  return plan ? serializeWeeklyPlan(plan) : null;
}

export async function saveWeeklyPlan(
  userId: string,
  weekStart: string,
  input: WeeklyPlanInput,
) {
  const weekStartDate = weekStartToDate(weekStart);
  const recipeIds = [...new Set(input.meals.map(({ recipeId }) => recipeId))];

  try {
    const plan = await prisma.$transaction(async (transaction) => {
      if (recipeIds.length > 0) {
        const recipeCount = await transaction.recipe.count({
          where: {
            userId,
            id: {
              in: recipeIds,
            },
          },
        });

        if (recipeCount !== recipeIds.length) {
          throw new WeeklyPlanReferenceError();
        }
      }

      let savedPlan: { id: string };
      if (input.expectedRevision === null) {
        savedPlan = await transaction.weeklyPlan.create({
          data: { userId, weekStart: weekStartDate },
          select: { id: true },
        });
      } else {
        const updated = await transaction.weeklyPlan.updateMany({
          where: { userId, weekStart: weekStartDate, revision: input.expectedRevision },
          data: { revision: { increment: 1 }, updatedAt: new Date() },
        });
        if (updated.count !== 1) {
          throw new WeeklyPlanRevisionConflictError();
        }
        savedPlan = await transaction.weeklyPlan.findUniqueOrThrow({
          where: { userId_weekStart: { userId, weekStart: weekStartDate } },
          select: { id: true },
        });
      }

      await transaction.plannedMeal.deleteMany({
        where: {
          weeklyPlanId: savedPlan.id,
        },
      });

      if (input.meals.length > 0) {
        await transaction.plannedMeal.createMany({
          data: input.meals.map((meal) => ({
            weeklyPlanId: savedPlan.id,
            ...meal,
          })),
        });
      }

      return transaction.weeklyPlan.findUniqueOrThrow({
        where: {
          id: savedPlan.id,
        },
        select: weeklyPlanSelect,
      });
    });

    return serializeWeeklyPlan(plan);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new WeeklyPlanRevisionConflictError();
    }
    if (isForeignKeyError(error)) {
      throw new WeeklyPlanReferenceError();
    }

    throw error;
  }
}
