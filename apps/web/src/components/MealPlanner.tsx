"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MealRecipeDialog, {
  type MealPlannerRecipe,
} from "@/components/MealRecipeDialog";
import RemoveIcon from "@/components/RemoveIcon";
import { isMealSlot, MEAL_SLOTS, mealSlotLabel, type MealSlot } from "@/lib/meal-slots";
import {
  formatLocalDate,
  getLocalWeekStart,
  getWeekDates,
  resolveWeekStart,
  shiftWeek,
} from "@/lib/week";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

type DraftMeal = {
  key: string;
  recipeId: string;
  dayOffset: number;
  mealSlot: MealSlot | null;
};

type WeeklyPlanMeal = {
  id: string;
  recipeId: string;
  dayOffset: number;
  position: number;
  mealSlot: MealSlot | null;
};

type WeeklyPlan = {
  id: string;
  weekStart: string;
  updatedAt: string;
  meals: WeeklyPlanMeal[];
};

type PlanLoadState = "loading" | "ready" | "error";
type RecipeLoadState = "loading" | "ready" | "error";

const MAX_MEALS_PER_WEEK = 70;

const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isRecipe(value: unknown): value is MealPlannerRecipe {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "description" in value &&
    isNullableString(value.description) &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string" &&
    "ingredients" in value &&
    Array.isArray(value.ingredients) &&
    value.ingredients.every(
      (ingredient) =>
        typeof ingredient === "object" &&
        ingredient !== null &&
        "name" in ingredient &&
        typeof ingredient.name === "string" &&
        "quantity" in ingredient &&
        isNullableString(ingredient.quantity) &&
        "unit" in ingredient &&
        isNullableString(ingredient.unit),
    )
  );
}

function isRecipeResponse(
  value: unknown,
): value is { recipes: MealPlannerRecipe[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "recipes" in value &&
    Array.isArray(value.recipes) &&
    value.recipes.every(isRecipe)
  );
}

function isWeeklyPlanMeal(value: unknown): value is WeeklyPlanMeal {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "recipeId" in value &&
    typeof value.recipeId === "string" &&
    "dayOffset" in value &&
    typeof value.dayOffset === "number" &&
    Number.isInteger(value.dayOffset) &&
    value.dayOffset >= 0 &&
    value.dayOffset <= 6 &&
    "position" in value &&
    typeof value.position === "number" &&
    Number.isInteger(value.position) &&
    value.position >= 0 &&
    "mealSlot" in value &&
    (value.mealSlot === null || isMealSlot(value.mealSlot))
  );
}

function isWeeklyPlan(value: unknown): value is WeeklyPlan {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "weekStart" in value &&
    typeof value.weekStart === "string" &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string" &&
    "meals" in value &&
    Array.isArray(value.meals) &&
    value.meals.every(isWeeklyPlanMeal)
  );
}

function isWeeklyPlanResponse(
  value: unknown,
): value is { plan: WeeklyPlan | null } {
  return (
    typeof value === "object" &&
    value !== null &&
    "plan" in value &&
    (value.plan === null || isWeeklyPlan(value.plan))
  );
}

function toDraftMeals(plan: WeeklyPlan | null): DraftMeal[] {
  return (plan?.meals ?? []).map((meal) => ({
    key: meal.id,
    recipeId: meal.recipeId,
    dayOffset: meal.dayOffset,
    mealSlot: meal.mealSlot,
  }));
}

function toPlanInput(meals: DraftMeal[]) {
  return meals.flatMap((meal, index, allMeals) => {
    const position = allMeals
      .slice(0, index)
      .filter((candidate) => candidate.dayOffset === meal.dayOffset).length;

    return [{
      recipeId: meal.recipeId,
      dayOffset: meal.dayOffset,
      position,
      mealSlot: meal.mealSlot,
    }];
  });
}

export default function MealPlanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedWeek = searchParams.get("week");
  const guideQuery = searchParams.get("guide") === "1" ? "&guide=1" : "";
  const weekStart = useMemo(
    () => resolveWeekStart(requestedWeek),
    [requestedWeek],
  );
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const [recipes, setRecipes] = useState<MealPlannerRecipe[]>([]);
  const [recipeLoadState, setRecipeLoadState] =
    useState<RecipeLoadState>("loading");
  const [recipeRequestNumber, setRecipeRequestNumber] = useState(0);
  const [draftMeals, setDraftMeals] = useState<DraftMeal[]>([]);
  const [planLoadState, setPlanLoadState] = useState<PlanLoadState>("loading");
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [planRequestNumber, setPlanRequestNumber] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{
    dayOffset: number;
    mealSlot: MealSlot;
  } | null>(null);
  const recipesRef = useRef<MealPlannerRecipe[]>([]);
  const recipesReadyRef = useRef(false);
  const planReadyRef = useRef(false);

  useEffect(() => {
    if (requestedWeek !== weekStart) {
      router.replace(`/meal-planner?week=${weekStart}${guideQuery}`);
    }
  }, [guideQuery, requestedWeek, router, weekStart]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/recipes", { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isRecipeResponse(payload)) {
          throw new Error("Unable to load recipes");
        }

        setRecipes(payload.recipes);
        recipesRef.current = payload.recipes;
        recipesReadyRef.current = true;
        setRecipeLoadState("ready");

        if (planReadyRef.current) {
          const recipeIds = new Set(payload.recipes.map((recipe) => recipe.id));

          setDraftMeals((current) => {
            const available = current.filter((meal) =>
              recipeIds.has(meal.recipeId),
            );

            if (available.length !== current.length) {
              setDirty(true);
            }
            return available;
          });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        recipesReadyRef.current = false;
        setRecipeLoadState("error");
      });

    return () => controller.abort();
  }, [recipeRequestNumber]);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/weekly-plans/${weekStart}`, { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isWeeklyPlanResponse(payload)) {
          throw new Error("Unable to load weekly plan");
        }

        const loadedMeals = toDraftMeals(payload.plan);
        const recipeIds = new Set(
          recipesRef.current.map((recipe) => recipe.id),
        );
        const availableMeals = recipesReadyRef.current
          ? loadedMeals.filter((meal) => recipeIds.has(meal.recipeId))
          : loadedMeals;

        planReadyRef.current = true;
        setDraftMeals(availableMeals);
        setDirty(availableMeals.length !== loadedMeals.length);
        setSaveError(null);
        setPickerTarget(null);
        setLoadedWeek(weekStart);
        setPlanLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        planReadyRef.current = false;
        setLoadedWeek(weekStart);
        setPlanLoadState("error");
      });

    return () => controller.abort();
  }, [planRequestNumber, weekStart]);

  useUnsavedChangesWarning(dirty);

  const recipeById = useMemo(
    () => new Map(recipes.map((recipe) => [recipe.id, recipe])),
    [recipes],
  );

  const savePlan = useCallback(async () => {
    if (planLoadState !== "ready" || loadedWeek !== weekStart || saving) {
      return false;
    }

    if (draftMeals.length > MAX_MEALS_PER_WEEK) {
      setSaveError("A weekly plan can have at most 70 meals.");
      return false;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/weekly-plans/${weekStart}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meals: toPlanInput(draftMeals) }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || !isWeeklyPlanResponse(payload) || !payload.plan) {
        throw new Error("Unable to save weekly plan");
      }

      setDraftMeals(toDraftMeals(payload.plan));
      setDirty(false);
      return true;
    } catch {
      setSaveError("Unable to save plan. Your changes are still here.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [draftMeals, loadedWeek, planLoadState, saving, weekStart]);

  function navigateToWeek(nextWeek: string) {
    if (nextWeek === weekStart) {
      return;
    }

    if (dirty && !window.confirm("Discard unsaved changes and change weeks?")) {
      return;
    }

    planReadyRef.current = false;
    setPlanLoadState("loading");
    setLoadedWeek(null);
    setDraftMeals([]);
    setDirty(false);
    setSaveError(null);
    setPickerTarget(null);
    router.push(`/meal-planner?week=${nextWeek}${guideQuery}`);
  }

  function addMeal(recipeId: string) {
    if (
      pickerTarget === null ||
      saving ||
      draftMeals.length >= MAX_MEALS_PER_WEEK
    ) {
      return;
    }

    setDraftMeals((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        recipeId,
        dayOffset: pickerTarget.dayOffset,
        mealSlot: pickerTarget.mealSlot,
      },
    ]);
    setDirty(true);
    setSaveError(null);
    setPickerTarget(null);
  }

  function assignMealSlot(key: string, mealSlot: MealSlot) {
    if (saving) {
      return;
    }

    setDraftMeals((current) => current.map((meal) =>
      meal.key === key ? { ...meal, mealSlot } : meal,
    ));
    setDirty(true);
    setSaveError(null);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(
        `[data-meal-remove-key="${key}"]`,
      )?.focus();
    });
  }

  function removeMeal(key: string) {
    if (saving) {
      return;
    }

    const removedMeal = draftMeals.find((meal) => meal.key === key);
    if (!removedMeal) {
      return;
    }
    const dayMeals = [
      ...MEAL_SLOTS.flatMap((slot) => draftMeals.filter((meal) =>
        meal.dayOffset === removedMeal.dayOffset && meal.mealSlot === slot,
      )),
      ...draftMeals.filter((meal) =>
        meal.dayOffset === removedMeal.dayOffset && meal.mealSlot === null,
      ),
    ];
    const removedIndex = dayMeals.findIndex((meal) => meal.key === key);

    setDraftMeals((current) => current.filter((meal) => meal.key !== key));
    setDirty(true);
    setSaveError(null);
    requestAnimationFrame(() => {
      const removeButtons = document.querySelectorAll<HTMLButtonElement>(
        `[data-meal-remove-day="${removedMeal.dayOffset}"]`,
      );
      const target =
        removeButtons[removedIndex] ??
        removeButtons[removedIndex - 1] ??
        document.querySelector<HTMLButtonElement>(
          `[data-add-meal-day="${removedMeal.dayOffset}"][data-add-meal-slot="${removedMeal.mealSlot ?? "breakfast"}"]`,
        );
      target?.focus();
    });
  }

  async function addWeekToGroceryList() {
    if (dirty && !(await savePlan())) {
      return;
    }

    router.push(`/grocery-list?importWeek=${weekStart}${guideQuery}`);
  }

  const planReady = planLoadState === "ready" && loadedWeek === weekStart;
  const visiblePlanLoadState =
    loadedWeek === weekStart ? planLoadState : "loading";
  const hasLoadError =
    visiblePlanLoadState === "error" || recipeLoadState === "error";
  const mutationsDisabled = saving || !planReady;
  const addMealDisabled =
    mutationsDisabled ||
    recipeLoadState !== "ready" ||
    recipes.length === 0 ||
    draftMeals.length >= MAX_MEALS_PER_WEEK;
  const groceryDisabled =
    !planReady ||
    recipeLoadState !== "ready" ||
    hasLoadError ||
    saving ||
    draftMeals.length === 0;
  const currentWeekStart = formatLocalDate(getLocalWeekStart());
  const isCurrentWeek = weekStart === currentWeekStart;
  const todayDateKey = formatLocalDate(new Date());

  if (recipeLoadState === "loading" || visiblePlanLoadState === "loading") {
    return (
      <p
        className="border-y border-[#e5e1d8] py-6 text-sm font-semibold text-[#69736b]"
        role="status"
      >
        Loading meal planner...
      </p>
    );
  }

  return (
    <div className="space-y-7">
      <section
        aria-label="Choose planning week"
        className="rounded-[1.5rem] border border-[#e2e4da] bg-white px-4 py-5 shadow-[0_12px_32px_rgba(36,52,43,0.04)] sm:px-6"
      >
        <div className="flex items-center justify-between gap-3">
          <button
            aria-label="Previous week"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#ded9cf] text-xl text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saving}
            onClick={() => navigateToWeek(shiftWeek(weekStart, -1))}
            title="Previous week"
            type="button"
          >
            <span aria-hidden="true">←</span>
          </button>
          <div className="min-w-0 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#78837b]">
              {isCurrentWeek ? "This week" : "Planning week"}
            </p>
            <p className="mt-1 [font-family:Georgia,serif] text-lg font-bold leading-tight text-[#24342b] sm:text-2xl">
              {dateFormatter.format(weekDates[0])} – {dateFormatter.format(weekDates[6])}
            </p>
          </div>
          <button
            aria-label="Next week"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#ded9cf] text-xl text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saving}
            onClick={() => navigateToWeek(shiftWeek(weekStart, 1))}
            title="Next week"
            type="button"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#ebe9e1] pt-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span
              aria-live="polite"
              className={`font-semibold ${dirty ? "text-[#9b5f34]" : "text-[#35644f]"}`}
            >
              {dirty ? "Unsaved changes to this week" : planReady ? "Plan saved" : ""}
            </span>
            {!isCurrentWeek ? (
              <button
                className="rounded-md font-bold text-[#35644f] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:opacity-50"
                disabled={saving}
                onClick={() => navigateToWeek(currentWeekStart)}
                type="button"
              >
                Go to this week
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="min-h-10 rounded-xl border border-[#ded9cf] bg-white px-4 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!dirty || !planReady || saving}
              onClick={() => void savePlan()}
              type="button"
            >
              {saving ? "Saving..." : "Save plan"}
            </button>
            <button
              className="min-h-10 rounded-xl bg-[#35644f] px-4 text-sm font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.12)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={groceryDisabled}
              onClick={() => void addWeekToGroceryList()}
              type="button"
            >
              Add week to grocery list
            </button>
          </div>
        </div>
      </section>

      {saveError && planReady ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm font-semibold text-red-800">{saveError}</p>
          <button
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-800 transition-colors hover:bg-red-50 disabled:opacity-50"
            disabled={saving}
            onClick={() => void savePlan()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {recipeLoadState === "error" ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm font-semibold text-red-800">
            Unable to load recipes. Your plan has been preserved.
          </p>
          <button
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-800 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
            onClick={() => {
              recipesReadyRef.current = false;
              setRecipeLoadState("loading");
              setRecipeRequestNumber((current) => current + 1);
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : recipes.length === 0 ? (
        <p className="text-sm font-semibold text-[#6f7a71]">
          <Link className="font-bold text-[#35644f] underline" href="/recipes">
            Create a recipe
          </Link>{" "}
          before planning meals.
        </p>
      ) : null}

      {visiblePlanLoadState === "error" ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm font-semibold text-red-800">
            Unable to load this weekly plan.
          </p>
          <button
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-800 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
            onClick={() => {
              planReadyRef.current = false;
              setPlanLoadState("loading");
              setLoadedWeek(null);
              setPlanRequestNumber((current) => current + 1);
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : (
        <ol className="space-y-4">
          {weekDates.map((date, dayOffset) => {
            const dayMeals = draftMeals.filter(
              (meal) => meal.dayOffset === dayOffset,
            );
            const dayName = dayFormatter.format(date);
            const isToday = formatLocalDate(date) === todayDateKey;

            return (
              <li
                className={`min-w-0 rounded-[1.5rem] border bg-white p-4 shadow-[0_8px_24px_rgba(36,52,43,0.04)] sm:p-5 ${isToday ? "border-[#8bb69a] ring-1 ring-[#dcebdd]" : "border-[#e2e4da]"}`}
                key={date.toISOString()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-[#ebe9e1] pb-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#78837b]">
                      {dayName}
                      {isToday ? <span className="rounded-full bg-[#e8f0e8] px-2 py-0.5 text-[0.625rem] text-[#35644f]">Today</span> : null}
                    </p>
                    <h2 className="mt-1 [font-family:Georgia,serif] text-[1.75rem] font-bold leading-tight text-[#24342b]">
                      {dateFormatter.format(date)}
                    </h2>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {MEAL_SLOTS.map((slot) => {
                    const slotMeals = dayMeals.filter((meal) => meal.mealSlot === slot);
                    const slotLabel = mealSlotLabel(slot);

                    return (
                      <section aria-label={`${slotLabel} on ${dayName}`} className="min-w-0 rounded-xl border border-[#e7e7df] bg-[#fbfaf6] p-3" key={slot}>
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#69766c]">{slotLabel}</h3>
                          <button
                            aria-label={`Add ${slotLabel.toLowerCase()} to ${dayName}`}
                            className="min-h-9 rounded-lg bg-[#e8f0e8] px-3 text-xs font-bold text-[#35644f] transition-colors hover:bg-[#dcebdd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50"
                            data-add-meal-day={dayOffset}
                            data-add-meal-slot={slot}
                            data-first-use-target="meal-planner"
                            disabled={addMealDisabled}
                            onClick={() => setPickerTarget({ dayOffset, mealSlot: slot })}
                            type="button"
                          >
                            + Add
                          </button>
                        </div>
                        {slotMeals.length === 0 ? (
                          <p className="mt-2 text-sm text-[#9aa49c]">No meal planned</p>
                        ) : (
                          <ol className="mt-3 space-y-2">
                            {slotMeals.map((meal) => (
                              <li className="flex min-w-0 items-center gap-2 rounded-lg bg-white px-3 py-2" key={meal.key}>
                                <p className="min-w-0 flex-1 break-words [font-family:Georgia,serif] text-base font-bold leading-snug text-[#24342b]">
                                  {recipeById.get(meal.recipeId)?.name ?? "Recipe details unavailable"}
                                </p>
                                <button
                                  aria-label={`Remove ${recipeById.get(meal.recipeId)?.name ?? "meal"} from ${slotLabel.toLowerCase()} on ${dayName}`}
                                  className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-[#9b4f40] transition-colors hover:bg-[#f6e8e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:cursor-not-allowed disabled:opacity-50"
                                  data-meal-remove-day={dayOffset}
                                  data-meal-remove-key={meal.key}
                                  disabled={mutationsDisabled}
                                  onClick={() => removeMeal(meal.key)}
                                  title="Remove meal"
                                  type="button"
                                >
                                  <RemoveIcon className="h-4 w-4" />
                                </button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </section>
                    );
                  })}
                </div>
                {dayMeals.some((meal) => meal.mealSlot === null) ? (
                  <section className="mt-3 rounded-xl border border-[#ead8bd] bg-[#fff7e9] p-3">
                    <h3 className="text-sm font-bold text-[#71502b]">Unassigned meals from an earlier plan</h3>
                    <p className="mt-1 text-xs text-[#71502b]">Choose a meal type to place each recipe.</p>
                    <ul className="mt-3 space-y-2">
                      {dayMeals.filter((meal) => meal.mealSlot === null).map((meal) => (
                        <li className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2" key={meal.key}>
                          <span className="min-w-0 flex-1 break-words text-sm font-bold text-[#24342b]">
                            {recipeById.get(meal.recipeId)?.name ?? "Recipe details unavailable"}
                          </span>
                          <select
                            aria-label={`Meal type for ${recipeById.get(meal.recipeId)?.name ?? "meal"} on ${dayName}`}
                            className="min-h-9 rounded-lg border border-[#ded9cf] bg-white px-2 text-sm text-[#24342b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:opacity-50"
                            defaultValue=""
                            disabled={mutationsDisabled}
                            onChange={(event) => {
                              if (isMealSlot(event.target.value)) {
                                assignMealSlot(meal.key, event.target.value);
                              }
                            }}
                          >
                            <option disabled value="">Choose type</option>
                            {MEAL_SLOTS.map((slot) => <option key={slot} value={slot}>{mealSlotLabel(slot)}</option>)}
                          </select>
                          <button
                            aria-label={`Remove ${recipeById.get(meal.recipeId)?.name ?? "meal"} from ${dayName}`}
                            className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[#9b4f40] hover:bg-[#f6e8e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:opacity-50"
                            data-meal-remove-day={dayOffset}
                            disabled={mutationsDisabled}
                            onClick={() => removeMeal(meal.key)}
                            title="Remove meal"
                            type="button"
                          >
                            <RemoveIcon className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {planReady && draftMeals.length >= MAX_MEALS_PER_WEEK ? (
        <p className="text-sm font-semibold text-[#6f7a71]" role="status">
          Maximum of 70 meals reached for this week.
        </p>
      ) : null}

      <MealRecipeDialog
        dayLabel={
          pickerTarget === null
            ? ""
            : `${pickerTarget.mealSlot} on ${dayFormatter.format(weekDates[pickerTarget.dayOffset])}`
        }
        onAdd={addMeal}
        onClose={() => setPickerTarget(null)}
        open={pickerTarget !== null}
        recipes={recipes}
      />
    </div>
  );
}
