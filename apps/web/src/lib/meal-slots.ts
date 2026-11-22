export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snacks"] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number];

export function isMealSlot(value: unknown): value is MealSlot {
  return MEAL_SLOTS.some((slot) => slot === value);
}

export function mealSlotLabel(slot: MealSlot) {
  return slot[0].toUpperCase() + slot.slice(1);
}
