export type MealSlot = "breakfast" | "lunch" | "dinner" | "snacks";
export const mealSlots: MealSlot[] = ["breakfast", "lunch", "dinner", "snacks"];

export type PlannedMeal = {
  id: string;
  recipeId: string;
  dayOffset: number;
  position: number;
  mealSlot: MealSlot | null;
};

export type WeeklyPlan = {
  id: string;
  weekStart: string;
  revision: number;
  updatedAt: string;
  meals: PlannedMeal[];
};

export function isWeeklyPlanResponse(value: unknown): value is { plan: WeeklyPlan | null } {
  if (typeof value !== "object" || value === null || !("plan" in value)) return false;
  const plan = value.plan;
  if (plan === null) return true;
  return typeof plan === "object" &&
    "id" in plan && typeof plan.id === "string" &&
    "weekStart" in plan && typeof plan.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(plan.weekStart) &&
    "revision" in plan && typeof plan.revision === "number" && Number.isSafeInteger(plan.revision) && plan.revision >= 0 &&
    "updatedAt" in plan && typeof plan.updatedAt === "string" &&
    "meals" in plan && Array.isArray(plan.meals) && plan.meals.every((meal) =>
      typeof meal === "object" && meal !== null &&
      "id" in meal && typeof meal.id === "string" &&
      "recipeId" in meal && typeof meal.recipeId === "string" &&
      "dayOffset" in meal && typeof meal.dayOffset === "number" && Number.isInteger(meal.dayOffset) && meal.dayOffset >= 0 && meal.dayOffset <= 6 &&
      "position" in meal && typeof meal.position === "number" && Number.isInteger(meal.position) && meal.position >= 0 &&
      "mealSlot" in meal && (meal.mealSlot === null || (typeof meal.mealSlot === "string" && mealSlots.some((slot) => slot === meal.mealSlot))));
}

export function formatCalendarDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function shiftCalendarDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return formatCalendarDate(new Date(Date.UTC(year, month - 1, day + days)));
}

export function currentWeekStart(today = new Date()): string {
  const localDay = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const daysSinceMonday = (today.getDay() + 6) % 7;
  return formatCalendarDate(new Date(localDay.getTime() - daysSinceMonday * 86_400_000));
}

export function formatDayLabel(weekStart: string, dayOffset: number): string {
  const [year, month, day] = shiftCalendarDate(weekStart, dayOffset).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}
