"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import PantryPickerDialog, {
  type PantryPickerLoadState,
  type PantryPickerOption,
} from "@/components/PantryPickerDialog";
import RecipeRecommendationsDialog from "@/components/RecipeRecommendationsDialog";
import RecipePickerDialog, {
  type RecipePickerLoadState,
  type RecipePickerOption,
} from "@/components/RecipePickerDialog";
import {
  calculateGroceryLines,
  calculateRecipeRecommendations,
  type GroceryLineCalculation,
} from "@/lib/grocery-list";
import { parseLocalDate } from "@/lib/week";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

type RecipeSource = "MANUAL" | "WEEKLY_PLAN";
type RecipeOccurrence = { recipeId: string; source: RecipeSource };

type PersistedGroceryItem = {
  lineKey: string;
  name: string;
  baseQuantity: string;
  baseUnit: string;
  quantityOverride: string | null;
  unitOverride: string | null;
  checked: boolean;
  dismissed: boolean;
  pantryItemId: string | null;
};

type PersistedGroceryList = {
  id: string;
  importedWeeklyPlanId: string | null;
  updatedAt: string;
  recipes: RecipeOccurrence[];
  items: PersistedGroceryItem[];
};

type GroceryListSnapshot = {
  importedWeeklyPlanId: string | null;
  recipes: RecipeOccurrence[];
  items: PersistedGroceryItem[];
};

type WeeklyPlan = {
  id: string;
  weekStart: string;
  updatedAt: string;
  meals: Array<{
    id: string;
    recipeId: string;
    dayOffset: number;
    position: number;
  }>;
};

type LineState = {
  baseQuantity: string;
  baseUnit: string;
  quantity: string;
  unit: string;
  checked: boolean;
  dismissed: boolean;
};

type LoadState = "loading" | "ready" | "error";

const MAX_GROCERY_RECIPES = 200;
const MAX_GROCERY_ITEMS = 1000;

function groceryLimitError(recipeCount: number, itemCount: number) {
  if (recipeCount > MAX_GROCERY_RECIPES) {
    return "A grocery list can have at most 200 recipe selections.";
  }
  if (itemCount > MAX_GROCERY_ITEMS) {
    return "A grocery list can have at most 1000 items.";
  }
  return null;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isRecipeOccurrence(value: unknown): value is RecipeOccurrence {
  return (
    typeof value === "object" &&
    value !== null &&
    "recipeId" in value &&
    typeof value.recipeId === "string" &&
    "source" in value &&
    (value.source === "MANUAL" || value.source === "WEEKLY_PLAN")
  );
}

function isPersistedGroceryItem(value: unknown): value is PersistedGroceryItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "lineKey" in value &&
    typeof value.lineKey === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "baseQuantity" in value &&
    typeof value.baseQuantity === "string" &&
    "baseUnit" in value &&
    typeof value.baseUnit === "string" &&
    "quantityOverride" in value &&
    isNullableString(value.quantityOverride) &&
    "unitOverride" in value &&
    isNullableString(value.unitOverride) &&
    "checked" in value &&
    typeof value.checked === "boolean" &&
    "dismissed" in value &&
    typeof value.dismissed === "boolean" &&
    "pantryItemId" in value &&
    isNullableString(value.pantryItemId)
  );
}

function isPersistedGroceryList(value: unknown): value is PersistedGroceryList {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "importedWeeklyPlanId" in value &&
    isNullableString(value.importedWeeklyPlanId) &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string" &&
    "recipes" in value &&
    Array.isArray(value.recipes) &&
    value.recipes.every(isRecipeOccurrence) &&
    "items" in value &&
    Array.isArray(value.items) &&
    value.items.every(isPersistedGroceryItem)
  );
}

function isGroceryListResponse(
  value: unknown,
): value is { list: PersistedGroceryList | null } {
  return (
    typeof value === "object" &&
    value !== null &&
    "list" in value &&
    (value.list === null || isPersistedGroceryList(value.list))
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
    value.meals.every(
      (meal) =>
        typeof meal === "object" &&
        meal !== null &&
        "id" in meal &&
        typeof meal.id === "string" &&
        "recipeId" in meal &&
        typeof meal.recipeId === "string" &&
        "dayOffset" in meal &&
        typeof meal.dayOffset === "number" &&
        Number.isInteger(meal.dayOffset) &&
        "position" in meal &&
        typeof meal.position === "number" &&
        Number.isInteger(meal.position),
    )
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

function lineStateFromPersisted(item: PersistedGroceryItem): LineState {
  return {
    baseQuantity: item.baseQuantity,
    baseUnit: item.baseUnit,
    quantity: item.quantityOverride ?? item.baseQuantity,
    unit: item.unitOverride ?? item.baseUnit,
    checked: item.checked,
    dismissed: item.dismissed,
  };
}

function defaultLineState(line: GroceryLineCalculation): LineState {
  return {
    baseQuantity: line.quantity,
    baseUnit: line.unit,
    quantity: line.quantity,
    unit: line.unit,
    checked: false,
    dismissed: false,
  };
}

function reconcileLineStates(
  lines: GroceryLineCalculation[],
  current: Record<string, LineState>,
) {
  return Object.fromEntries(
    lines.map((line) => {
      const previous = current[line.id];

      if (!previous) {
        return [line.id, defaultLineState(line)];
      }

      const sameBase =
        previous.baseQuantity === line.quantity &&
        previous.baseUnit === line.unit;

      return [
        line.id,
        {
          baseQuantity: line.quantity,
          baseUnit: line.unit,
          quantity:
            previous.quantity !== previous.baseQuantity
              ? previous.quantity
              : line.quantity,
          unit: previous.unit !== previous.baseUnit ? previous.unit : line.unit,
          checked: sameBase ? previous.checked : false,
          dismissed: sameBase ? previous.dismissed : false,
        },
      ];
    }),
  );
}

function countRecipeOccurrences(occurrences: RecipeOccurrence[]) {
  const counts = new Map<string, number>();

  for (const occurrence of occurrences) {
    counts.set(occurrence.recipeId, (counts.get(occurrence.recipeId) ?? 0) + 1);
  }

  return counts;
}

function calculateLinesForDraft(
  occurrences: RecipeOccurrence[],
  selectedPantryItems: PantryPickerOption[],
  recipes: RecipePickerOption[],
  pantryItems: PantryPickerOption[],
) {
  const counts = countRecipeOccurrences(occurrences);
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const effectiveRecipes = [...counts.keys()]
    .map((id) => recipeById.get(id))
    .filter((recipe): recipe is RecipePickerOption => Boolean(recipe));

  return calculateGroceryLines(
    effectiveRecipes,
    pantryItems,
    new Set(selectedPantryItems.map((item) => item.id)),
    counts,
  );
}

function createSnapshot(
  occurrences: RecipeOccurrence[],
  importedWeeklyPlanId: string | null,
  lines: GroceryLineCalculation[],
  states: Record<string, LineState>,
): GroceryListSnapshot {
  return {
    importedWeeklyPlanId,
    recipes: occurrences,
    items: lines.map((line) => {
      const state = states[line.id] ?? defaultLineState(line);

      return {
        lineKey: line.id,
        name: line.name,
        baseQuantity: line.quantity,
        baseUnit: line.unit,
        quantityOverride:
          state.quantity === line.quantity ? null : state.quantity,
        unitOverride: state.unit === line.unit ? null : state.unit,
        checked: state.checked,
        dismissed: state.dismissed,
        pantryItemId: line.pantryItemId ?? null,
      };
    }),
  };
}

function isStrictMonday(value: string) {
  const date = parseLocalDate(value);
  return date !== null && date.getDay() === 1;
}

function sourceDescription(
  line: GroceryLineCalculation,
  recipeNames: Map<string, string>,
  recipeCounts: Map<string, number>,
  pantryNames: Map<string, string>,
) {
  const recipes = line.recipeIds
    .map((id) => {
      const name = recipeNames.get(id);
      const count = recipeCounts.get(id) ?? 0;
      return name ? `${name}${count > 1 ? ` ×${count}` : ""}` : null;
    })
    .filter((name): name is string => Boolean(name));
  const pantryName = line.pantryItemId
    ? pantryNames.get(line.pantryItemId)
    : null;
  const sources = [
    recipes.length ? `Recipes: ${recipes.join(", ")}` : null,
    pantryName ? `Pantry: ${pantryName}` : null,
  ].filter(Boolean);

  return sources.join(" · ");
}

export default function GroceryList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedImportWeek = searchParams.get("importWeek");
  const [allRecipes, setAllRecipes] = useState<RecipePickerOption[]>([]);
  const [recipeLoadState, setRecipeLoadState] =
    useState<RecipePickerLoadState["status"]>("loading");
  const [pantryItems, setPantryItems] = useState<PantryPickerOption[]>([]);
  const [pantryLoadState, setPantryLoadState] =
    useState<PantryPickerLoadState["status"]>("loading");
  const [listLoadState, setListLoadState] = useState<LoadState>("loading");
  const [loadedList, setLoadedList] = useState<PersistedGroceryList | null>(
    null,
  );
  const [listRequestNumber, setListRequestNumber] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [recipeOccurrences, setRecipeOccurrences] = useState<
    RecipeOccurrence[]
  >([]);
  const [selectedPantryItems, setSelectedPantryItems] = useState<
    PantryPickerOption[]
  >([]);
  const [importedWeeklyPlanId, setImportedWeeklyPlanId] = useState<
    string | null
  >(null);
  const [lineStates, setLineStates] = useState<Record<string, LineState>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importAttempt, setImportAttempt] = useState(0);
  const [importConfirmation, setImportConfirmation] = useState<string | null>(
    null,
  );
  const attemptedImportRef = useRef<string | null>(null);
  const allRecipesRef = useRef(allRecipes);
  const pantryItemsRef = useRef(pantryItems);
  const recipeOccurrencesRef = useRef(recipeOccurrences);
  const selectedPantryItemsRef = useRef(selectedPantryItems);
  const lineStatesRef = useRef(lineStates);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/grocery-list", { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isGroceryListResponse(payload)) {
          throw new Error("Unable to load grocery list");
        }

        setLoadedList(payload.list);
        setListLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setLoadedList(null);
        setListLoadState("error");
      });

    return () => controller.abort();
  }, [listRequestNumber]);

  const handleRecipeLoadStateChange = useCallback(
    (state: RecipePickerLoadState) => {
      setRecipeLoadState(state.status);
      if (state.status === "ready") {
        setAllRecipes(state.recipes);
      }
    },
    [],
  );

  const handlePantryLoadStateChange = useCallback(
    (state: PantryPickerLoadState) => {
      setPantryLoadState(state.status);
      if (state.status === "ready") {
        setPantryItems(state.items);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      initialized ||
      listLoadState !== "ready" ||
      recipeLoadState !== "ready" ||
      pantryLoadState !== "ready"
    ) {
      return;
    }

    const recipeIds = new Set(allRecipes.map((recipe) => recipe.id));
    const seenManualRecipeIds = new Set<string>();
    const availableOccurrences = (loadedList?.recipes ?? []).filter(
      (occurrence) => {
        if (!recipeIds.has(occurrence.recipeId)) {
          return false;
        }
        if (occurrence.source === "WEEKLY_PLAN") {
          return true;
        }
        if (seenManualRecipeIds.has(occurrence.recipeId)) {
          return false;
        }
        seenManualRecipeIds.add(occurrence.recipeId);
        return true;
      },
    );
    const selectedPantryIds = new Set(
      (loadedList?.items ?? []).flatMap((item) =>
        item.pantryItemId ? [item.pantryItemId] : [],
      ),
    );

    const timeout = window.setTimeout(() => {
      const availablePantryItems = pantryItems.filter((item) =>
        selectedPantryIds.has(item.id),
      );
      const persistedStates = Object.fromEntries(
        (loadedList?.items ?? []).map((item) => [
          item.lineKey,
          lineStateFromPersisted(item),
        ]),
      );
      const initialLines = calculateLinesForDraft(
        availableOccurrences,
        availablePantryItems,
        allRecipes,
        pantryItems,
      );
      const initialStates = reconcileLineStates(initialLines, persistedStates);
      const persistedItemsByKey = new Map(
        (loadedList?.items ?? []).map((item) => [item.lineKey, item]),
      );
      const calculationsChanged =
        initialLines.length !== persistedItemsByKey.size ||
        initialLines.some((line) => {
          const item = persistedItemsByKey.get(line.id);
          return (
            !item ||
            item.baseQuantity !== line.quantity ||
            item.baseUnit !== line.unit
          );
        });

      setRecipeOccurrences(availableOccurrences);
      setSelectedPantryItems(availablePantryItems);
      setImportedWeeklyPlanId(loadedList?.importedWeeklyPlanId ?? null);
      setLineStates(initialStates);
      setDirty(
        calculationsChanged ||
          availableOccurrences.length !== (loadedList?.recipes.length ?? 0),
      );
      setInitialized(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [
    allRecipes,
    initialized,
    listLoadState,
    loadedList,
    pantryItems,
    pantryLoadState,
    recipeLoadState,
  ]);

  const recipeCounts = useMemo(
    () => countRecipeOccurrences(recipeOccurrences),
    [recipeOccurrences],
  );
  const recipeById = useMemo(
    () => new Map(allRecipes.map((recipe) => [recipe.id, recipe])),
    [allRecipes],
  );
  const effectiveRecipes = useMemo(
    () =>
      [...recipeCounts.keys()]
        .map((id) => recipeById.get(id))
        .filter((recipe): recipe is RecipePickerOption => Boolean(recipe)),
    [recipeById, recipeCounts],
  );
  const manualRecipes = useMemo(() => {
    const manualIds = new Set(
      recipeOccurrences
        .filter((occurrence) => occurrence.source === "MANUAL")
        .map((occurrence) => occurrence.recipeId),
    );
    return allRecipes.filter((recipe) => manualIds.has(recipe.id));
  }, [allRecipes, recipeOccurrences]);
  const sourcesReady =
    initialized &&
    listLoadState === "ready" &&
    recipeLoadState === "ready" &&
    pantryLoadState === "ready";
  const calculatedLines = useMemo(
    () =>
      sourcesReady
        ? calculateGroceryLines(
            effectiveRecipes,
            pantryItems,
            new Set(selectedPantryItems.map((item) => item.id)),
            recipeCounts,
          )
        : [],
    [
      effectiveRecipes,
      pantryItems,
      recipeCounts,
      selectedPantryItems,
      sourcesReady,
    ],
  );

  const reconciledLineStates = useMemo(
    () => reconcileLineStates(calculatedLines, lineStates),
    [calculatedLines, lineStates],
  );

  useEffect(() => {
    allRecipesRef.current = allRecipes;
    pantryItemsRef.current = pantryItems;
    recipeOccurrencesRef.current = recipeOccurrences;
    selectedPantryItemsRef.current = selectedPantryItems;
    lineStatesRef.current = reconciledLineStates;
  }, [
    allRecipes,
    pantryItems,
    recipeOccurrences,
    reconciledLineStates,
    selectedPantryItems,
  ]);

  useUnsavedChangesWarning(dirty);

  useEffect(() => {
    if (!importConfirmation) {
      return;
    }
    const timeout = window.setTimeout(() => setImportConfirmation(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [importConfirmation]);

  useEffect(() => {
    if (!requestedImportWeek || !sourcesReady || saving || clearing) {
      return;
    }

    const importWeek = requestedImportWeek;
    const attemptKey = `${importWeek}:${importAttempt}`;
    if (attemptedImportRef.current === attemptKey) {
      return;
    }
    attemptedImportRef.current = attemptKey;

    const controller = new AbortController();

    async function importPlan() {
      if (!isStrictMonday(importWeek)) {
        setImportError("The requested week must be a valid Monday date.");
        return;
      }

      setImporting(true);
      setImportError(null);

      try {
        const planResponse = await fetch(`/api/weekly-plans/${importWeek}`, {
          signal: controller.signal,
        });
        const planPayload: unknown = await planResponse
          .json()
          .catch(() => null);

        if (!planResponse.ok || !isWeeklyPlanResponse(planPayload)) {
          throw new Error("Unable to load the weekly plan.");
        }
        if (!planPayload.plan) {
          throw new Error("No weekly plan exists for that week.");
        }

        const manualOccurrences = recipeOccurrencesRef.current.filter(
          (occurrence) => occurrence.source === "MANUAL",
        );
        const nextOccurrences: RecipeOccurrence[] = [
          ...manualOccurrences,
          ...planPayload.plan.meals.map((meal) => ({
            recipeId: meal.recipeId,
            source: "WEEKLY_PLAN" as const,
          })),
        ];
        const nextCounts = countRecipeOccurrences(nextOccurrences);
        const recipesById = new Map(
          allRecipesRef.current.map((recipe) => [recipe.id, recipe]),
        );
        const nextRecipes = [...nextCounts.keys()]
          .map((id) => recipesById.get(id))
          .filter((recipe): recipe is RecipePickerOption => Boolean(recipe));
        const nextLines = calculateGroceryLines(
          nextRecipes,
          pantryItemsRef.current,
          new Set(selectedPantryItemsRef.current.map((item) => item.id)),
          nextCounts,
        );
        const limitError = groceryLimitError(
          nextOccurrences.length,
          nextLines.length,
        );
        if (limitError) {
          throw new Error(limitError);
        }
        const nextLineStates = reconcileLineStates(
          nextLines,
          lineStatesRef.current,
        );

        setRecipeOccurrences(nextOccurrences);
        setImportedWeeklyPlanId(planPayload.plan.id);
        setLineStates(nextLineStates);
        setDirty(true);

        const saveResponse = await fetch("/api/grocery-list", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            createSnapshot(
              nextOccurrences,
              planPayload.plan.id,
              nextLines,
              nextLineStates,
            ),
          ),
          signal: controller.signal,
        });
        const savePayload: unknown = await saveResponse
          .json()
          .catch(() => null);

        if (
          !saveResponse.ok ||
          !isGroceryListResponse(savePayload) ||
          !savePayload.list
        ) {
          throw new Error("Unable to save the imported grocery list.");
        }

        setDirty(false);
        setSaveError(null);
        setImportConfirmation("Weekly plan added to your grocery list.");
        router.replace("/grocery-list");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setImportError(
          error instanceof Error
            ? error.message
            : "Unable to import the weekly plan.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setImporting(false);
        }
      }
    }

    void importPlan();
    return () => controller.abort();
  }, [
    clearing,
    importAttempt,
    requestedImportWeek,
    router,
    saving,
    sourcesReady,
  ]);

  const visibleLines = useMemo(
    () =>
      calculatedLines.filter(
        (line) => !(reconciledLineStates[line.id]?.dismissed ?? false),
      ),
    [calculatedLines, reconciledLineStates],
  );
  const selectedRecipeIds = useMemo(
    () => new Set(recipeCounts.keys()),
    [recipeCounts],
  );
  const matchingRecommendations = useMemo(
    () =>
      sourcesReady
        ? calculateRecipeRecommendations(
            allRecipes,
            pantryItems,
            visibleLines,
            new Set(),
          )
        : [],
    [allRecipes, pantryItems, sourcesReady, visibleLines],
  );
  const recommendations = useMemo(
    () =>
      matchingRecommendations.filter(
        (recommendation) => !selectedRecipeIds.has(recommendation.recipe.id),
      ),
    [matchingRecommendations, selectedRecipeIds],
  );
  const recipeNames = useMemo(
    () => new Map(allRecipes.map((recipe) => [recipe.id, recipe.name])),
    [allRecipes],
  );
  const pantryNames = useMemo(
    () => new Map(selectedPantryItems.map((item) => [item.id, item.name])),
    [selectedPantryItems],
  );
  const mutating = saving || clearing || importing;

  function markDirty() {
    setDirty(true);
    setSaveError(null);
    setClearError(null);
  }

  function commitRecipes(recipes: RecipePickerOption[]) {
    const currentManualIds = new Set(
      recipeOccurrences
        .filter((occurrence) => occurrence.source === "MANUAL")
        .map((occurrence) => occurrence.recipeId),
    );
    const nextManualIds = new Set(recipes.map((recipe) => recipe.id));
    if (
      currentManualIds.size === nextManualIds.size &&
      [...nextManualIds].every((id) => currentManualIds.has(id))
    ) {
      return;
    }

    const nextOccurrences: RecipeOccurrence[] = [
      ...recipeOccurrences.filter(
        (occurrence) => occurrence.source === "WEEKLY_PLAN",
      ),
      ...recipes.map((recipe) => ({
        recipeId: recipe.id,
        source: "MANUAL" as const,
      })),
    ];
    const nextLines = calculateLinesForDraft(
      nextOccurrences,
      selectedPantryItems,
      allRecipes,
      pantryItems,
    );
    const limitError = groceryLimitError(
      nextOccurrences.length,
      nextLines.length,
    );
    if (limitError) {
      setSaveError(limitError);
      return;
    }
    setRecipeOccurrences(nextOccurrences);
    setLineStates(reconcileLineStates(nextLines, reconciledLineStates));
    markDirty();
  }

  function commitPantryItems(items: PantryPickerOption[]) {
    const currentIds = new Set(selectedPantryItems.map((item) => item.id));
    const nextIds = new Set(items.map((item) => item.id));
    if (
      currentIds.size === nextIds.size &&
      [...nextIds].every((id) => currentIds.has(id))
    ) {
      return;
    }

    const nextLines = calculateLinesForDraft(
      recipeOccurrences,
      items,
      allRecipes,
      pantryItems,
    );
    const limitError = groceryLimitError(
      recipeOccurrences.length,
      nextLines.length,
    );
    if (limitError) {
      setSaveError(limitError);
      return;
    }
    setSelectedPantryItems(items);
    setLineStates(reconcileLineStates(nextLines, reconciledLineStates));
    markDirty();
  }

  function removeRecipe(id: string) {
    if (mutating) {
      return;
    }
    const removedIndex = effectiveRecipes.findIndex(
      (recipe) => recipe.id === id,
    );
    const nextOccurrences = recipeOccurrences.filter(
      (occurrence) => occurrence.recipeId !== id,
    );
    const nextLines = calculateLinesForDraft(
      nextOccurrences,
      selectedPantryItems,
      allRecipes,
      pantryItems,
    );
    setRecipeOccurrences(nextOccurrences);
    setLineStates(reconcileLineStates(nextLines, reconciledLineStates));
    markDirty();
    requestAnimationFrame(() => {
      const removeButtons = document.querySelectorAll<HTMLButtonElement>(
        "[data-recipe-source-remove]",
      );
      const target =
        removeButtons[removedIndex] ??
        removeButtons[removedIndex - 1] ??
        document.querySelector<HTMLButtonElement>(
          "[data-recipe-picker-trigger]",
        );
      target?.focus();
    });
  }

  function removePantryItem(id: string) {
    if (mutating) {
      return;
    }
    const removedIndex = selectedPantryItems.findIndex(
      (item) => item.id === id,
    );
    const nextPantryItems = selectedPantryItems.filter(
      (item) => item.id !== id,
    );
    const nextLines = calculateLinesForDraft(
      recipeOccurrences,
      nextPantryItems,
      allRecipes,
      pantryItems,
    );
    setSelectedPantryItems(nextPantryItems);
    setLineStates(reconcileLineStates(nextLines, reconciledLineStates));
    markDirty();
    requestAnimationFrame(() => {
      const removeButtons = document.querySelectorAll<HTMLButtonElement>(
        "[data-pantry-source-remove]",
      );
      const target =
        removeButtons[removedIndex] ??
        removeButtons[removedIndex - 1] ??
        document.querySelector<HTMLButtonElement>(
          "[data-pantry-picker-trigger]",
        );
      target?.focus();
    });
  }

  function addRecommendedRecipe(id: string) {
    if (mutating || selectedRecipeIds.has(id)) {
      return;
    }
    const nextOccurrences: RecipeOccurrence[] = [
      ...recipeOccurrences,
      { recipeId: id, source: "MANUAL" },
    ];
    const nextLines = calculateLinesForDraft(
      nextOccurrences,
      selectedPantryItems,
      allRecipes,
      pantryItems,
    );
    const limitError = groceryLimitError(
      nextOccurrences.length,
      nextLines.length,
    );
    if (limitError) {
      setSaveError(limitError);
      return;
    }
    setRecipeOccurrences(nextOccurrences);
    setLineStates(reconcileLineStates(nextLines, reconciledLineStates));
    markDirty();
  }

  function updateLine(
    line: GroceryLineCalculation,
    values: Pick<LineState, "quantity" | "unit">,
  ) {
    if (mutating) {
      return;
    }
    setLineStates((current) => ({
      ...current,
      [line.id]: {
        ...(reconciledLineStates[line.id] ?? defaultLineState(line)),
        ...values,
      },
    }));
    markDirty();
  }

  function toggleLine(line: GroceryLineCalculation) {
    if (mutating) {
      return;
    }
    setLineStates((current) => {
      const state = reconciledLineStates[line.id] ?? defaultLineState(line);
      return {
        ...current,
        [line.id]: { ...state, checked: !state.checked },
      };
    });
    markDirty();
  }

  function dismissLine(line: GroceryLineCalculation) {
    if (mutating) {
      return;
    }
    const removedIndex = visibleLines.findIndex(
      (candidate) => candidate.id === line.id,
    );
    setLineStates((current) => ({
      ...current,
      [line.id]: {
        ...(reconciledLineStates[line.id] ?? defaultLineState(line)),
        dismissed: true,
      },
    }));
    markDirty();
    requestAnimationFrame(() => {
      const removeButtons = document.querySelectorAll<HTMLButtonElement>(
        "[data-grocery-line-remove]",
      );
      const target =
        removeButtons[removedIndex] ??
        removeButtons[removedIndex - 1] ??
        document.querySelector<HTMLElement>("[data-grocery-items-heading]");
      target?.focus();
    });
  }

  function resetCalculatedAmount(line: GroceryLineCalculation) {
    if (mutating) {
      return;
    }
    setLineStates((current) => ({
      ...current,
      [line.id]: {
        ...(reconciledLineStates[line.id] ?? defaultLineState(line)),
        quantity: line.quantity,
        unit: line.unit,
      },
    }));
    markDirty();
  }

  async function saveList() {
    if (!sourcesReady || mutating) {
      return;
    }
    const limitError = groceryLimitError(
      recipeOccurrences.length,
      calculatedLines.length,
    );
    if (limitError) {
      setSaveError(limitError);
      return;
    }
    setSaving(true);
    setSaveError(null);

    try {
      const reconciledStates = reconciledLineStates;
      const response = await fetch("/api/grocery-list", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          createSnapshot(
            recipeOccurrences,
            importedWeeklyPlanId,
            calculatedLines,
            reconciledStates,
          ),
        ),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || !isGroceryListResponse(payload) || !payload.list) {
        throw new Error("Unable to save grocery list");
      }

      setLineStates(reconciledStates);
      setDirty(false);
    } catch {
      setSaveError("Unable to save grocery list. Your changes are still here.");
    } finally {
      setSaving(false);
    }
  }

  async function clearList() {
    if (mutating || !window.confirm("Clear the entire grocery list?")) {
      return;
    }
    setClearing(true);
    setClearError(null);

    try {
      const response = await fetch("/api/grocery-list", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Unable to clear grocery list");
      }

      setRecipeOccurrences([]);
      setSelectedPantryItems([]);
      setImportedWeeklyPlanId(null);
      setLineStates({});
      setDirty(false);
      setSaveError(null);
    } catch {
      setClearError("Unable to clear grocery list. Please try again.");
    } finally {
      setClearing(false);
    }
  }

  function retryListLoad() {
    setListLoadState("loading");
    setLoadedList(null);
    setInitialized(false);
    setListRequestNumber((current) => current + 1);
  }

  function retryImport() {
    attemptedImportRef.current = null;
    setImportError(null);
    setImportAttempt((current) => current + 1);
  }

  const noSources =
    recipeOccurrences.length === 0 && selectedPantryItems.length === 0;
  const recommendationEmptyMessage =
    allRecipes.length === 0
      ? "Create a recipe to receive recommendations."
      : pantryItems.length === 0 && visibleLines.length === 0
        ? "Add pantry items or grocery items to receive recommendations."
        : matchingRecommendations.length > 0 && recommendations.length === 0
          ? "All matching recipes are already on your grocery list."
          : "No recipes match your pantry or current grocery list.";

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-3 border-y border-[#e5e1d8] py-4">
        <RecipePickerDialog
          disabled={mutating || (!initialized && recipeLoadState !== "error")}
          onCommit={commitRecipes}
          onLoadStateChange={handleRecipeLoadStateChange}
          pantryItems={pantryItems}
          pantryStatus={pantryLoadState}
          selectedRecipes={manualRecipes}
        />
        <PantryPickerDialog
          disabled={mutating || (!initialized && pantryLoadState !== "error")}
          onCommit={commitPantryItems}
          onLoadStateChange={handlePantryLoadStateChange}
          selectedItems={selectedPantryItems}
        />
        <RecipeRecommendationsDialog
          disabled={
            !sourcesReady ||
            mutating ||
            recipeOccurrences.length >= MAX_GROCERY_RECIPES
          }
          emptyMessage={recommendationEmptyMessage}
          onAddRecipe={addRecommendedRecipe}
          recommendations={recommendations}
        />
        {recipeOccurrences.length >= MAX_GROCERY_RECIPES ? (
          <span className="text-sm font-semibold text-[#6f7a71]" role="status">
            Maximum of 200 recipe selections reached.
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {dirty ? (
            <span className="text-sm font-semibold text-[#9b5f34]">
              Unsaved changes
            </span>
          ) : null}
          <button
            className="min-h-10 rounded-xl bg-[#35644f] px-4 text-sm font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.12)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!dirty || !sourcesReady || mutating}
            onClick={() => void saveList()}
            type="button"
          >
            {saving ? "Saving..." : "Save grocery list"}
          </button>
          <button
            className="min-h-10 rounded-xl border border-[#d8c5bd] bg-white px-4 text-sm font-bold text-[#9b4f40] transition-colors hover:bg-[#f6e8e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!initialized || mutating}
            onClick={() => void clearList()}
            type="button"
          >
            {clearing ? "Clearing..." : "Clear list"}
          </button>
        </div>
      </div>

      {listLoadState === "loading" ? (
        <p
          className="border-y border-[#e5e1d8] py-6 text-sm font-semibold text-[#69736b]"
          role="status"
        >
          Loading your grocery list...
        </p>
      ) : listLoadState === "error" ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm font-semibold text-red-800">
            Unable to load your grocery list. Nothing has been changed.
          </p>
          <button
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-800 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
            onClick={retryListLoad}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {saveError ? (
        <p className="text-sm font-semibold text-red-800" role="alert">
          {saveError}
        </p>
      ) : null}
      {clearError ? (
        <p className="text-sm font-semibold text-red-800" role="alert">
          {clearError}
        </p>
      ) : null}
      {importing ? (
        <p className="text-sm font-semibold text-[#69736b]" role="status">
          Importing weekly plan...
        </p>
      ) : null}
      {importError ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm font-semibold text-red-800">{importError}</p>
          {requestedImportWeek && isStrictMonday(requestedImportWeek) ? (
            <button
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-800 transition-colors hover:bg-red-50 disabled:opacity-50"
              disabled={mutating}
              onClick={retryImport}
              type="button"
            >
              Try import again
            </button>
          ) : null}
        </div>
      ) : null}
      {importConfirmation ? (
        <p className="text-sm font-bold text-[#35644f]" role="status">
          {importConfirmation}
        </p>
      ) : null}

      {initialized &&
      (effectiveRecipes.length || selectedPantryItems.length) ? (
        <div className="grid gap-5 border-y border-[#e5e1d8] py-5 md:grid-cols-2">
          {effectiveRecipes.length ? (
            <section aria-labelledby="selected-recipes-title">
              <h2
                className="text-xs font-bold uppercase tracking-[0.18em] text-[#c5745a]"
                id="selected-recipes-title"
              >
                Recipes
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {effectiveRecipes.map((recipe) => {
                  const count = recipeCounts.get(recipe.id) ?? 1;
                  return (
                    <li
                      className="flex max-w-full items-center gap-2 rounded-full bg-[#edf3ed] px-3 py-1.5 text-sm font-semibold text-[#35644f]"
                      key={recipe.id}
                    >
                      <span className="truncate">
                        {recipe.name}
                        {count > 1 ? ` ×${count}` : ""}
                      </span>
                      <button
                        aria-label={`Remove every ${recipe.name} preparation from grocery list`}
                        className="font-bold text-[#79857d] hover:text-[#9b4f40] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:opacity-50"
                        data-recipe-source-remove
                        disabled={mutating}
                        onClick={() => removeRecipe(recipe.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {selectedPantryItems.length ? (
            <section aria-labelledby="selected-pantry-title">
              <h2
                className="text-xs font-bold uppercase tracking-[0.18em] text-[#c5745a]"
                id="selected-pantry-title"
              >
                Pantry items
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {selectedPantryItems.map((item) => (
                  <li
                    className="flex max-w-full items-center gap-2 rounded-full bg-[#edf3ed] px-3 py-1.5 text-sm font-semibold text-[#35644f]"
                    key={item.id}
                  >
                    <span className="truncate">{item.name}</span>
                    <button
                      aria-label={`Remove ${item.name} from grocery list sources`}
                      className="font-bold text-[#79857d] hover:text-[#9b4f40] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:opacity-50"
                      data-pantry-source-remove
                      disabled={mutating}
                      onClick={() => removePantryItem(item.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {pantryLoadState === "loading" ? (
        <p className="text-sm font-semibold text-[#69736b]" role="status">
          Loading pantry data...
        </p>
      ) : null}
      {pantryLoadState === "error" ? (
        <p className="text-sm font-semibold text-red-800" role="alert">
          Unable to load pantry data. Open Add from Pantry and try again.
        </p>
      ) : null}
      {recipeLoadState === "loading" ? (
        <p className="text-sm font-semibold text-[#69736b]" role="status">
          Loading recipes...
        </p>
      ) : null}
      {recipeLoadState === "error" ? (
        <p className="text-sm font-semibold text-red-800" role="alert">
          Unable to load recipes. Open Add from Recipes and try again.
        </p>
      ) : null}

      {initialized ? (
        <section aria-labelledby="grocery-items-title">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2
              className="[font-family:Georgia,serif] text-[1.8rem] font-bold leading-tight text-[#24342b]"
              data-grocery-items-heading
              id="grocery-items-title"
              tabIndex={-1}
            >
              Items to buy
            </h2>
            {visibleLines.length ? (
              <span className="text-sm font-semibold text-[#78837b]">
                {visibleLines.length}{" "}
                {visibleLines.length === 1 ? "item" : "items"}
              </span>
            ) : null}
          </div>
          {visibleLines.length ? (
            <ul className="divide-y divide-[#ebe7dd] border-y border-[#e5e1d8]">
              {visibleLines.map((line, index) => {
                const state =
                  reconciledLineStates[line.id] ?? defaultLineState(line);
                const source = sourceDescription(
                  line,
                  recipeNames,
                  recipeCounts,
                  pantryNames,
                );
                const hasOverride =
                  state.quantity !== line.quantity || state.unit !== line.unit;

                return (
                  <li
                    className="grid gap-4 py-5 sm:grid-cols-[auto_minmax(0,1fr)_minmax(7rem,0.42fr)_minmax(7rem,0.42fr)_auto] sm:items-center"
                    key={line.id}
                  >
                    <button
                      aria-label={`Mark ${line.name} as purchased`}
                      aria-pressed={state.checked}
                      className={`flex size-7 items-center justify-center rounded-full border text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50 ${
                        state.checked
                          ? "border-[#35644f] bg-[#35644f] text-white"
                          : "border-[#c9cfc7] bg-[#fbfaf6] text-transparent hover:border-[#35644f]"
                      }`}
                      disabled={mutating}
                      onClick={() => toggleLine(line)}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={`block h-3 w-1.5 rotate-45 border-b-2 border-r-2 ${
                          state.checked ? "border-white" : "border-transparent"
                        }`}
                      />
                    </button>
                    <div className="min-w-0 self-center">
                      <p
                        className={`text-base font-bold ${
                          state.checked
                            ? "text-[#9aa49c] line-through"
                            : "text-[#24342b]"
                        }`}
                      >
                        {line.name}
                      </p>
                      {source ? (
                        <p className="mt-1 text-xs font-medium text-[#8b958c]">
                          {source}
                        </p>
                      ) : null}
                      {line.warning ? (
                        <p className="mt-1 text-xs font-semibold text-[#9b5f34]">
                          {line.warning}
                        </p>
                      ) : null}
                      {hasOverride ? (
                        <button
                          className="mt-2 rounded-md text-xs font-bold text-[#35644f] underline decoration-[#b9c7b8] underline-offset-4 transition-colors hover:text-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:opacity-50"
                          disabled={mutating}
                          onClick={() => resetCalculatedAmount(line)}
                          type="button"
                        >
                          Use calculated amount
                        </button>
                      ) : null}
                    </div>
                    <div>
                      <label
                        className="text-xs font-bold uppercase tracking-[0.12em] text-[#939c92]"
                        htmlFor={`grocery-quantity-${index}`}
                      >
                        Quantity
                      </label>
                      <input
                        className="mt-1 h-10 w-full rounded-xl border border-[#ded9cf] bg-[#fbfaf6] px-3 text-sm font-semibold text-[#24342b] outline-none transition-colors focus:border-[#35644f] focus:ring-2 focus:ring-[#35644f]/15 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={mutating}
                        id={`grocery-quantity-${index}`}
                        maxLength={100}
                        onChange={(event) =>
                          updateLine(line, {
                            quantity: event.target.value,
                            unit: state.unit,
                          })
                        }
                        type="text"
                        value={state.quantity}
                      />
                    </div>
                    <div>
                      <label
                        className="text-xs font-bold uppercase tracking-[0.12em] text-[#939c92]"
                        htmlFor={`grocery-unit-${index}`}
                      >
                        Unit
                      </label>
                      <input
                        className="mt-1 h-10 w-full rounded-xl border border-[#ded9cf] bg-[#fbfaf6] px-3 text-sm font-semibold text-[#24342b] outline-none transition-colors focus:border-[#35644f] focus:ring-2 focus:ring-[#35644f]/15 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={mutating}
                        id={`grocery-unit-${index}`}
                        maxLength={100}
                        onChange={(event) =>
                          updateLine(line, {
                            quantity: state.quantity,
                            unit: event.target.value,
                          })
                        }
                        type="text"
                        value={state.unit}
                      />
                    </div>
                    <button
                      aria-label={`Remove ${line.name} from grocery list`}
                      className="h-10 rounded-xl px-3 text-sm font-bold text-[#9b4f40] transition-colors hover:bg-[#f6e8e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:cursor-not-allowed disabled:opacity-50"
                      data-grocery-line-remove
                      disabled={mutating}
                      onClick={() => dismissLine(line)}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="border-y border-dashed border-[#d8d3c8] py-8 text-center">
              <p className="text-sm font-semibold text-[#6f7a71]">
                {noSources
                  ? "Add recipes or low pantry items to start your grocery list."
                  : "Your pantry covers the selected recipes, or all generated items have been removed."}
              </p>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
