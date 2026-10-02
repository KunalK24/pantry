"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MealRecipeDialog, {
  type MealPlannerRecipe,
} from "@/components/MealRecipeDialog";
import {
  getWeekDates,
  resolveWeekStart,
  shiftWeek,
} from "@/lib/week";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

type DraftMeal = {
  key: string;
  recipeId: string;
  dayOffset: number;
};

type WeeklyPlanMeal = {
  id: string;
  recipeId: string;
  dayOffset: number;
  position: number;
};

type WeeklyPlan = {
  id: string;
  weekStart: string;
  updatedAt: string;
  meals: WeeklyPlanMeal[];
};

type PlanLoadState = "loading" | "ready" | "error";
type RecipeLoadState = "loading" | "ready" | "error";

const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const rangeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
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
    value.position >= 0
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
  }));
}

function toPlanInput(meals: DraftMeal[]) {
  return meals.flatMap((meal, index, allMeals) => {
    const position = allMeals
      .slice(0, index)
      .filter((candidate) => candidate.dayOffset === meal.dayOffset).length;

    return [{ recipeId: meal.recipeId, dayOffset: meal.dayOffset, position }];
  });
}

export default function MealPlanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedWeek = searchParams.get("week");
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
  const [planLoadState, setPlanLoadState] =
    useState<PlanLoadState>("loading");
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [planRequestNumber, setPlanRequestNumber] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickerDay, setPickerDay] = useState<number | null>(null);
  const recipesRef = useRef<MealPlannerRecipe[]>([]);
  const recipesReadyRef = useRef(false);
  const planReadyRef = useRef(false);

  useEffect(() => {
    if (requestedWeek !== weekStart) {
      router.replace(`/meal-planner?week=${weekStart}`);
    }
  }, [requestedWeek, router, weekStart]);

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

            if (available.length !== current.length) setDirty(true);
            return available;
          });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
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
        setPickerDay(null);
        setLoadedWeek(weekStart);
        setPlanLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
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
    if (
      planLoadState !== "ready" ||
      loadedWeek !== weekStart ||
      saving
    ) {
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

  function navigateWeek(amount: number) {
    if (dirty && !window.confirm("Discard unsaved changes and change weeks?")) {
      return;
    }

    planReadyRef.current = false;
    setPlanLoadState("loading");
    setLoadedWeek(null);
    setDraftMeals([]);
    setDirty(false);
    setSaveError(null);
    setPickerDay(null);
    router.push(`/meal-planner?week=${shiftWeek(weekStart, amount)}`);
  }

  function addMeal(recipeId: string) {
    if (pickerDay === null || saving) return;

    setDraftMeals((current) => [
      ...current,
      { key: crypto.randomUUID(), recipeId, dayOffset: pickerDay },
    ]);
    setDirty(true);
    setSaveError(null);
    setPickerDay(null);
  }

  function removeMeal(key: string) {
    if (saving) return;

    const removedMeal = draftMeals.find((meal) => meal.key === key);
    if (!removedMeal) return;
    const dayMeals = draftMeals.filter(
      (meal) => meal.dayOffset === removedMeal.dayOffset,
    );
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
          `[data-add-meal-day="${removedMeal.dayOffset}"]`,
        );
      target?.focus();
    });
  }

  async function addWeekToGroceryList() {
    if (dirty && !(await savePlan())) return;

    router.push(`/grocery-list?importWeek=${weekStart}`);
  }

  const planReady = planLoadState === "ready" && loadedWeek === weekStart;
  const visiblePlanLoadState =
    loadedWeek === weekStart ? planLoadState : "loading";
  const hasLoadError =
    visiblePlanLoadState === "error" || recipeLoadState === "error";
  const mutationsDisabled = saving || !planReady;
  const addMealDisabled =
    mutationsDisabled || recipeLoadState !== "ready" || recipes.length === 0;
  const groceryDisabled =
    !planReady ||
    recipeLoadState !== "ready" ||
    hasLoadError ||
    saving ||
    draftMeals.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-zinc-200 py-4 dark:border-zinc-800">
        <button
          className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:border-zinc-700 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
          disabled={saving}
          onClick={() => navigateWeek(-1)}
          type="button"
        >
          Previous week
        </button>
        <p className="text-center text-sm font-semibold">
          {rangeFormatter.format(weekDates[0])} - {rangeFormatter.format(weekDates[6])}
        </p>
        <button
          className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:border-zinc-700 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
          disabled={saving}
          onClick={() => navigateWeek(1)}
          type="button"
        >
          Next week
        </button>
      </div>

      {recipeLoadState === "loading" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
          Loading recipes...
        </p>
      ) : recipeLoadState === "error" ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-red-700 dark:text-red-400">
            Unable to load recipes. Your plan has been preserved.
          </p>
          <button
            className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
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
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link className="font-semibold underline" href="/recipes">
            Create a recipe
          </Link>{" "}
          before planning meals.
        </p>
      ) : null}

      {visiblePlanLoadState === "loading" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
          Loading weekly plan...
        </p>
      ) : visiblePlanLoadState === "error" ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm text-red-700 dark:text-red-400">
            Unable to load this weekly plan.
          </p>
          <button
            className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
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
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {weekDates.map((date, dayOffset) => {
            const dayMeals = draftMeals.filter(
              (meal) => meal.dayOffset === dayOffset,
            );

            return (
              <section
                className="border-t border-zinc-200 pt-4 dark:border-zinc-800"
                key={date.toISOString()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">{dayFormatter.format(date)}</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {dateFormatter.format(date)}
                    </p>
                  </div>
                  <button
                    className="border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
                    data-add-meal-day={dayOffset}
                    disabled={addMealDisabled}
                    onClick={() => setPickerDay(dayOffset)}
                    type="button"
                  >
                    Add meal
                  </button>
                </div>

                {dayMeals.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">No meals planned</p>
                ) : (
                  <ol className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
                    {dayMeals.map((meal) => (
                      <li
                        className="flex items-center justify-between gap-4 py-3"
                        key={meal.key}
                      >
                        <span className="min-w-0 truncate text-sm font-medium">
                          {recipeById.get(meal.recipeId)?.name ??
                            "Recipe details unavailable"}
                        </span>
                        <button
                          className="shrink-0 px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
                          data-meal-remove-day={dayOffset}
                          disabled={mutationsDisabled}
                          onClick={() => removeMeal(meal.key)}
                          type="button"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <div aria-live="polite" className="min-h-5 text-sm">
          {dirty ? (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              Unsaved changes
            </span>
          ) : planReady ? (
            <span className="text-zinc-500">Plan saved</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            disabled={!dirty || !planReady || saving}
            onClick={() => void savePlan()}
            type="button"
          >
            {saving ? "Saving..." : "Save plan"}
          </button>
          <button
            className="bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            disabled={groceryDisabled}
            onClick={() => void addWeekToGroceryList()}
            type="button"
          >
            Add week to grocery list
          </button>
        </div>
      </div>

      {saveError && planReady ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-red-700 dark:text-red-400">{saveError}</p>
          <button
            className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            disabled={saving}
            onClick={() => void savePlan()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      <MealRecipeDialog
        dayLabel={pickerDay === null ? "" : dayFormatter.format(weekDates[pickerDay])}
        onAdd={addMeal}
        onClose={() => setPickerDay(null)}
        open={pickerDay !== null}
        recipes={recipes}
      />
    </div>
  );
}
