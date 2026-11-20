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
  name: string;
  importedWeeklyPlanId: string | null;
  updatedAt: string;
  recipes: RecipeOccurrence[];
  items: PersistedGroceryItem[];
};

type GroceryListSummary = {
  id: string;
  name: string;
  updatedAt: string;
  itemCount: number;
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
    "name" in value &&
    typeof value.name === "string" &&
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

function isGroceryListsResponse(value: unknown): value is { lists: GroceryListSummary[] } {
  return typeof value === "object" && value !== null && "lists" in value &&
    Array.isArray(value.lists) && value.lists.every((list) =>
      typeof list === "object" && list !== null &&
      "id" in list && typeof list.id === "string" &&
      "name" in list && typeof list.name === "string" &&
      "updatedAt" in list && typeof list.updatedAt === "string" &&
      "itemCount" in list && typeof list.itemCount === "number",
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

function manualLinesFromItems(items: PersistedGroceryItem[]): GroceryLineCalculation[] {
  return items.map((item) => ({
    id: item.lineKey,
    name: item.name,
    quantity: item.baseQuantity,
    unit: item.baseUnit,
    recipeIds: [],
    calculation: "manual",
  }));
}

function snapshotManualItems(items: PersistedGroceryItem[], states: Record<string, LineState>) {
  return items.map((item) => {
    const state = states[item.lineKey] ?? lineStateFromPersisted(item);
    return {
      ...item,
      quantityOverride: state.quantity === item.baseQuantity ? null : state.quantity,
      unitOverride: state.unit === item.baseUnit ? null : state.unit,
      checked: state.checked,
      dismissed: state.dismissed,
    };
  });
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
  manualItems: PersistedGroceryItem[],
): GroceryListSnapshot {
  return {
    importedWeeklyPlanId,
    recipes: occurrences,
    items: [...lines.map((line) => {
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
    }), ...manualItems],
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
  if (line.id.startsWith("custom:")) {
    return "Added manually";
  }
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
  const [lists, setLists] = useState<GroceryListSummary[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listName, setListName] = useState("");
  const [listActionError, setListActionError] = useState<string | null>(null);
  const [listActionBusy, setListActionBusy] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [isRenamingList, setIsRenamingList] = useState(false);
  const [manualItems, setManualItems] = useState<PersistedGroceryItem[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");
  const [manualUnit, setManualUnit] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
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
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importAttempt, setImportAttempt] = useState(0);
  const [importConfirmation, setImportConfirmation] = useState<string | null>(
    null,
  );
  const attemptedImportRef = useRef<string | null>(null);
  const attemptedListCreationRef = useRef<string | null>(null);
  const addItemDialogRef = useRef<HTMLDialogElement>(null);
  const addItemTriggerRef = useRef<HTMLButtonElement>(null);
  const manualNameRef = useRef<HTMLInputElement>(null);
  const allRecipesRef = useRef(allRecipes);
  const pantryItemsRef = useRef(pantryItems);
  const recipeOccurrencesRef = useRef(recipeOccurrences);
  const selectedPantryItemsRef = useRef(selectedPantryItems);
  const lineStatesRef = useRef(lineStates);
  const importedWeeklyPlanIdRef = useRef(importedWeeklyPlanId);
  const dirtyRef = useRef(dirty);
  const manualItemsRef = useRef(manualItems);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/grocery-lists", { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isGroceryListsResponse(payload)) {
          throw new Error("Unable to load grocery lists");
        }
        setLists(payload.lists);
        setSelectedListId((current) => current && payload.lists.some((list) => list.id === current)
          ? current : payload.lists[0]?.id ?? null);
        if (payload.lists.length === 0) {
          setListLoadState("ready");
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {return;}
        setListLoadState("error");
      });
    return () => controller.abort();
  }, [listRequestNumber]);

  useEffect(() => {
    if (!selectedListId) {return;}
    const controller = new AbortController();

    fetch(`/api/grocery-lists/${selectedListId}`, { signal: controller.signal })
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
  }, [selectedListId, listRequestNumber]);

  useEffect(() => {
    if (!requestedImportWeek || !isStrictMonday(requestedImportWeek) ||
      selectedListId || lists.length || listLoadState !== "ready" ||
      attemptedListCreationRef.current === requestedImportWeek) {
      return;
    }

    attemptedListCreationRef.current = requestedImportWeek;
    setListActionBusy(true);
    fetch("/api/grocery-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Week of ${requestedImportWeek}` }),
    }).then(async (response) => {
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isGroceryListResponse(payload) || !payload.list) {
        throw new Error("Unable to create a list for this week");
      }
      const list = payload.list;
      setLists([{ id: list.id, name: list.name, updatedAt: list.updatedAt, itemCount: 0 }]);
      setListLoadState("loading");
      setSelectedListId(list.id);
    }).catch(() => {
      setListActionError("Could not create a list for this weekly plan. Please try creating one above.");
    }).finally(() => setListActionBusy(false));
  }, [listLoadState, lists.length, requestedImportWeek, selectedListId]);

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
      const persistedManualItems = (loadedList?.items ?? []).filter((item) => item.lineKey.startsWith("custom:"));
      const initialStates = reconcileLineStates([...initialLines, ...manualLinesFromItems(persistedManualItems)], persistedStates);
      const persistedItemsByKey = new Map(
        (loadedList?.items ?? []).map((item) => [item.lineKey, item]),
      );
      const calculationsChanged =
        initialLines.length + persistedManualItems.length !== persistedItemsByKey.size ||
        initialLines.some((line) => {
          const item = persistedItemsByKey.get(line.id);
          return (
            !item ||
            item.baseQuantity !== line.quantity ||
            item.baseUnit !== line.unit
          );
        });

      setRecipeOccurrences(availableOccurrences);
      setManualItems(persistedManualItems);
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
    selectedListId !== null &&
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
  const allLines = useMemo(
    () => [...calculatedLines, ...manualLinesFromItems(manualItems)],
    [calculatedLines, manualItems],
  );

  const reconciledLineStates = useMemo(
    () => reconcileLineStates(allLines, lineStates),
    [allLines, lineStates],
  );

  useEffect(() => {
    allRecipesRef.current = allRecipes;
    pantryItemsRef.current = pantryItems;
    recipeOccurrencesRef.current = recipeOccurrences;
    selectedPantryItemsRef.current = selectedPantryItems;
    lineStatesRef.current = reconciledLineStates;
    manualItemsRef.current = manualItems;
    importedWeeklyPlanIdRef.current = importedWeeklyPlanId;
    dirtyRef.current = dirty;
  }, [
    allRecipes,
    dirty,
    importedWeeklyPlanId,
    pantryItems,
    recipeOccurrences,
    reconciledLineStates,
    manualItems,
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
    if (!requestedImportWeek || !sourcesReady || !selectedListId || saving) {
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

        const hasImportedWeek = importedWeeklyPlanIdRef.current !== null;
        if (hasImportedWeek || dirtyRef.current) {
          const previousMealCount = recipeOccurrencesRef.current.filter(
            (occurrence) => occurrence.source === "WEEKLY_PLAN",
          ).length;
          const nextMealCount = planPayload.plan.meals.length;
          const planChange = hasImportedWeek
            ? `Replace the currently imported week's ${previousMealCount} ${previousMealCount === 1 ? "meal" : "meals"} with ${nextMealCount} ${nextMealCount === 1 ? "meal" : "meals"} from the selected week?`
            : `Add ${nextMealCount} ${nextMealCount === 1 ? "meal" : "meals"} from the selected week?`;
          const unsavedChanges = dirtyRef.current
            ? " Your unsaved grocery list changes will be included in this save."
            : "";
          if (!window.confirm(`${planChange} Manual recipes will stay. The updated grocery list will be saved immediately.${unsavedChanges}`)) {
            router.replace("/grocery-list");
            return;
          }
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
          nextLines.length + manualItemsRef.current.length,
        );
        if (limitError) {
          throw new Error(limitError);
        }
        const nextLineStates = reconcileLineStates(
          [...nextLines, ...manualLinesFromItems(manualItemsRef.current)],
          lineStatesRef.current,
        );

        setRecipeOccurrences(nextOccurrences);
        setImportedWeeklyPlanId(planPayload.plan.id);
        setLineStates(nextLineStates);
        setDirty(true);

        const saveResponse = await fetch(`/api/grocery-lists/${selectedListId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            createSnapshot(
              nextOccurrences,
              planPayload.plan.id,
              nextLines,
              nextLineStates,
              snapshotManualItems(manualItemsRef.current, nextLineStates),
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
    importAttempt,
    requestedImportWeek,
    selectedListId,
    router,
    saving,
    sourcesReady,
  ]);

  const visibleLines = useMemo(
    () =>
      allLines.filter(
        (line) => !(reconciledLineStates[line.id]?.dismissed ?? false),
      ),
    [allLines, reconciledLineStates],
  );
  const dismissedLines = useMemo(
    () =>
      allLines.filter(
        (line) => reconciledLineStates[line.id]?.dismissed ?? false,
      ),
    [allLines, reconciledLineStates],
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
  const mutating = saving || importing;

  function markDirty() {
    setDirty(true);
    setSaveError(null);
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
      nextLines.length + manualItems.length,
    );
    if (limitError) {
      setSaveError(limitError);
      return;
    }
    setRecipeOccurrences(nextOccurrences);
    setLineStates(reconcileLineStates([...nextLines, ...manualLinesFromItems(manualItems)], reconciledLineStates));
    markDirty();
  }

  function removeRecipe(id: string) {
    if (mutating) {
      return;
    }

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
    setLineStates(
      reconcileLineStates(
        [...nextLines, ...manualLinesFromItems(manualItems)],
        reconciledLineStates,
      ),
    );
    markDirty();
    requestAnimationFrame(() => {
      const nextRemoveButton = document.querySelector<HTMLButtonElement>(
        "[data-recipe-source-remove]",
      );
      (nextRemoveButton ?? addItemTriggerRef.current)?.focus();
    });
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
      nextLines.length + manualItems.length,
    );
    if (limitError) {
      setSaveError(limitError);
      return;
    }
    setSelectedPantryItems(items);
    setLineStates(reconcileLineStates([...nextLines, ...manualLinesFromItems(manualItems)], reconciledLineStates));
    markDirty();
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
      nextLines.length + manualItems.length,
    );
    if (limitError) {
      setSaveError(limitError);
      return;
    }
    setRecipeOccurrences(nextOccurrences);
    setLineStates(reconcileLineStates([...nextLines, ...manualLinesFromItems(manualItems)], reconciledLineStates));
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
    if (line.id.startsWith("custom:")) {
      setManualItems((current) => current.filter((item) => item.lineKey !== line.id));
      markDirty();
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

  function restoreLine(line: GroceryLineCalculation) {
    if (mutating) {
      return;
    }
    setLineStates((current) => ({
      ...current,
      [line.id]: {
        ...(reconciledLineStates[line.id] ?? defaultLineState(line)),
        dismissed: false,
      },
    }));
    markDirty();
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-grocery-items-heading]")?.focus();
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
    if (!sourcesReady || mutating || !selectedListId) {
      return;
    }
    const limitError = groceryLimitError(
      recipeOccurrences.length,
      allLines.length,
    );
    if (limitError) {
      setSaveError(limitError);
      return;
    }
    setSaving(true);
    setSaveError(null);

    try {
      const reconciledStates = reconciledLineStates;
      const response = await fetch(`/api/grocery-lists/${selectedListId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          createSnapshot(
            recipeOccurrences,
            importedWeeklyPlanId,
            calculatedLines,
            reconciledStates,
            snapshotManualItems(manualItems, reconciledStates),
          ),
        ),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || !isGroceryListResponse(payload) || !payload.list) {
        throw new Error("Unable to save grocery list");
      }

      setLineStates(reconciledStates);
      setDirty(false);
      setLists((current) => current.map((list) => list.id === selectedListId ? {
        ...list,
        itemCount: allLines.length,
        updatedAt: payload.list!.updatedAt,
      } : list));
    } catch {
      setSaveError("Unable to save grocery list. Your changes are still here.");
    } finally {
      setSaving(false);
    }
  }

  function retryListLoad() {
    setListLoadState("loading");
    setLoadedList(null);
    setInitialized(false);
    setListRequestNumber((current) => current + 1);
  }

  function resetDraft() {
    setRecipeOccurrences([]);
    setSelectedPantryItems([]);
    setManualItems([]);
    setImportedWeeklyPlanId(null);
    setLineStates({});
    setDirty(false);
  }

  function switchList(id: string) {
    if (id === selectedListId || mutating || listActionBusy) {return;}
    if (dirty && !window.confirm("Discard unsaved changes and open another list?")) {return;}
    setInitialized(false);
    resetDraft();
    setLoadedList(null);
    setListLoadState("loading");
    setSelectedListId(id);
    setSaveError(null);
    setListActionError(null);
  }

  async function createList(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = listName.trim();
    if (!name || name.length > 100 || listActionBusy || mutating) {return;}
    if (dirty && !window.confirm("Discard unsaved changes and create a new list?")) {return;}
    setListActionBusy(true);
    setListActionError(null);
    try {
      const response = await fetch("/api/grocery-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isGroceryListResponse(payload) || !payload.list) {
        throw new Error("Unable to create list");
      }
      const list = payload.list;
      setLists((current) => [...current, { id: list.id, name: list.name, updatedAt: list.updatedAt, itemCount: 0 }]);
      setListName("");
      setIsCreatingList(false);
      setInitialized(false);
      resetDraft();
      setLoadedList(null);
      setListLoadState("loading");
      setSelectedListId(list.id);
    } catch {
      setListActionError("Could not create the list. Please try again.");
    } finally {
      setListActionBusy(false);
    }
  }

  async function renameList(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = listName.trim();
    if (!selectedListId || !name || name.length > 100 || listActionBusy || mutating) {return;}
    setListActionBusy(true);
    setListActionError(null);
    try {
      const response = await fetch(`/api/grocery-lists/${selectedListId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {throw new Error("Unable to rename list");}
      setLists((current) => current.map((list) => list.id === selectedListId ? { ...list, name } : list));
      setLoadedList((current) => current ? { ...current, name } : current);
      setIsRenamingList(false);
    } catch {
      setListActionError("Could not rename the list. Please try again.");
    } finally {
      setListActionBusy(false);
    }
  }

  async function deleteList() {
    if (!selectedListId || listActionBusy || mutating || !window.confirm(`Delete “${loadedList?.name ?? "this list"}” and all its items?`)) {return;}
    setListActionBusy(true);
    setListActionError(null);
    try {
      const response = await fetch(`/api/grocery-lists/${selectedListId}`, { method: "DELETE" });
      if (!response.ok) {throw new Error("Unable to delete list");}
      const remaining = lists.filter((list) => list.id !== selectedListId);
      setLists(remaining);
      setInitialized(false);
      resetDraft();
      setLoadedList(null);
      setListLoadState("ready");
      setSelectedListId(remaining[0]?.id ?? null);
      if (remaining.length) {setListLoadState("loading");}
    } catch {
      setListActionError("Could not delete the list. Please try again.");
    } finally {
      setListActionBusy(false);
    }
  }

  function addManualItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = manualName.trim();
    if (!name || name.length > 200 || allLines.length >= MAX_GROCERY_ITEMS) {
      setManualError("Enter an item name (up to 200 characters).");
      return;
    }
    const item: PersistedGroceryItem = {
      lineKey: `custom:${crypto.randomUUID()}`,
      name,
      baseQuantity: manualQuantity.trim(),
      baseUnit: manualUnit.trim(),
      quantityOverride: null,
      unitOverride: null,
      checked: false,
      dismissed: false,
      pantryItemId: null,
    };
    setManualItems((current) => [...current, item]);
    setManualName("");
    setManualQuantity("");
    setManualUnit("");
    setManualError(null);
    markDirty();
    closeAddItemDialog();
  }

  function openAddItemDialog() {
    addItemDialogRef.current?.showModal();
    requestAnimationFrame(() => manualNameRef.current?.focus());
  }

  function closeAddItemDialog() {
    addItemDialogRef.current?.close();
  }

  function retryImport() {
    attemptedImportRef.current = null;
    setImportError(null);
    setImportAttempt((current) => current + 1);
  }

  const noSources =
    recipeOccurrences.length === 0 && selectedPantryItems.length === 0;
  const purchasedCount = visibleLines.filter(
    (line) => (reconciledLineStates[line.id] ?? defaultLineState(line)).checked,
  ).length;
  const recommendationEmptyMessage =
    allRecipes.length === 0
      ? "Create a recipe to receive recommendations."
      : pantryItems.length === 0 && visibleLines.length === 0
        ? "Add pantry items or grocery items to receive recommendations."
        : matchingRecommendations.length > 0 && recommendations.length === 0
          ? "All matching recipes are already on your grocery list."
          : "No recipes match your pantry or current grocery list.";

  return (
    <div className="grid gap-7 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
      <aside aria-label="Your grocery lists" className="rounded-[1.5rem] border border-[#e2e4da] bg-white p-4 shadow-[0_12px_32px_rgba(36,52,43,0.04)] lg:sticky lg:top-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#69766c]">Your lists</h2>
          <button className="rounded-lg bg-[#e9f1e9] px-2.5 py-1.5 text-xs font-bold text-[#35644f] hover:bg-[#dbe9dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:opacity-50" disabled={listActionBusy || mutating} onClick={() => { setListName(""); setIsCreatingList(true); setIsRenamingList(false); }} type="button">+ New list</button>
        </div>
        {isCreatingList ? (
          <form className="mt-4 space-y-2" onSubmit={(event) => void createList(event)}>
            <label className="block text-xs font-bold text-[#4d5b50]" htmlFor="new-grocery-list-name">List name</label>
            <input autoFocus className="h-10 w-full rounded-lg border border-[#cbd5cb] px-3 text-sm outline-none focus:border-[#35644f]" id="new-grocery-list-name" maxLength={100} onChange={(event) => setListName(event.target.value)} placeholder="e.g. Weekend shop" required value={listName} />
            <div className="flex gap-2"><button className="rounded-lg bg-[#35644f] px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={listActionBusy} type="submit">Create</button><button className="rounded-lg px-2 py-2 text-xs font-bold text-[#69766c]" onClick={() => setIsCreatingList(false)} type="button">Cancel</button></div>
          </form>
        ) : null}
        {listActionError ? <p className="mt-3 text-sm text-red-800" role="alert">{listActionError}</p> : null}
        {lists.length ? <ul className="mt-4 space-y-1.5">{lists.map((list) => (
          <li key={list.id}>
            <button aria-current={list.id === selectedListId ? "page" : undefined} className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-sm transition-colors ${list.id === selectedListId ? "bg-[#e8f0e8] font-bold text-[#294e3e]" : "text-[#526258] hover:bg-[#f5f6f1]"}`} disabled={listActionBusy || mutating} onClick={() => switchList(list.id)} type="button"><span className="min-w-0 truncate">{list.name}</span><span className="shrink-0 text-xs text-[#7f8d81]">{list.itemCount}</span></button>
          </li>
        ))}</ul> : <p className="mt-5 text-sm leading-6 text-[#69766c]">Create a list for your next shop.</p>}
        {selectedListId ? (
          <section aria-labelledby="selected-recipes-title" className="mt-5 border-t border-[#e8e9e1] pt-5">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#69766c]" id="selected-recipes-title">
              Recipes added
            </h3>
            {effectiveRecipes.length ? (
              <ul className="mt-3 space-y-2">
                {effectiveRecipes.map((recipe) => {
                  const count = recipeCounts.get(recipe.id) ?? 1;
                  return (
                    <li className="rounded-xl bg-[#f5f7f1] px-3 py-2.5" key={recipe.id}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words text-sm font-semibold text-[#294e3e]">
                          {recipe.name}{count > 1 ? ` ×${count}` : ""}
                        </span>
                        <button
                          aria-label={`Remove every ${recipe.name} preparation from grocery list`}
                          className="shrink-0 text-xs font-bold text-[#69766c] hover:text-[#9b4f40] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:opacity-50"
                          data-recipe-source-remove
                          disabled={mutating || !sourcesReady}
                          onClick={() => removeRecipe(recipe.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-5 text-[#7b887e]">
                No recipes added to this list yet.
              </p>
            )}
          </section>
        ) : null}
      </aside>
      <div className="min-w-0 space-y-7">
      {!selectedListId && listLoadState === "ready" ? <section className="rounded-[1.5rem] border border-dashed border-[#cbd5cb] bg-white p-8 text-center"><h2 className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]">Your shopping starts with a list</h2><p className="mt-2 text-sm text-[#69766c]">Name a list for a trip, a meal plan, or the week ahead.</p><button className="mt-5 rounded-xl bg-[#35644f] px-5 py-2.5 text-sm font-bold text-white" onClick={() => setIsCreatingList(true)} type="button">Create your first list</button></section> : null}
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

      {pantryLoadState === "loading" ? (
        <p className="text-sm font-semibold text-[#69736b]" role="status">
          Loading pantry data...
        </p>
      ) : null}
      {pantryLoadState === "error" ? (
        <p className="text-sm font-semibold text-red-800" role="alert">
          Unable to load pantry data. Open Add item, then try Add from pantry again.
        </p>
      ) : null}
      {recipeLoadState === "loading" ? (
        <p className="text-sm font-semibold text-[#69736b]" role="status">
          Loading recipes...
        </p>
      ) : null}
      {recipeLoadState === "error" ? (
        <p className="text-sm font-semibold text-red-800" role="alert">
          Unable to load recipes. Open Add item, then try Add from recipes again.
        </p>
      ) : null}

      {selectedListId ? (
        <dialog
          aria-labelledby="grocery-sources-title"
          className="m-auto max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-[#ded9cf] bg-[#fbfaf6] p-0 text-[#24342b] shadow-[0_24px_60px_rgba(42,48,38,0.18)] backdrop:bg-[#24342b]/35"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeAddItemDialog();
            }
          }}
          onClose={() => addItemTriggerRef.current?.focus()}
          ref={addItemDialogRef}
        >
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]" id="grocery-sources-title">Add item</h2>
                <p className="mt-1 text-sm text-[#6f7a71]">Type an item or choose from your pantry and recipes.</p>
              </div>
              <button aria-label="Close add item dialog" className="rounded-lg px-2 py-1 text-sm font-bold text-[#6f7a71] hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]" onClick={closeAddItemDialog} type="button">Close</button>
            </div>
          <form className="mt-5 rounded-2xl bg-[#f5f7f1] p-4" onSubmit={addManualItem}>
            <label className="text-sm font-bold text-[#344b3a]" htmlFor="manual-grocery-name">Add an item manually</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_6rem_auto]">
              <input className="h-11 min-w-0 rounded-xl border border-[#d9e1d7] bg-white px-3 text-sm outline-none focus:border-[#35644f]" disabled={!sourcesReady || mutating} id="manual-grocery-name" maxLength={200} onChange={(event) => setManualName(event.target.value)} placeholder="Item name" ref={manualNameRef} required value={manualName} />
              <input aria-label="Quantity" className="h-11 min-w-0 rounded-xl border border-[#d9e1d7] bg-white px-3 text-sm outline-none focus:border-[#35644f]" disabled={!sourcesReady || mutating} maxLength={100} onChange={(event) => setManualQuantity(event.target.value)} placeholder="Qty" value={manualQuantity} />
              <input aria-label="Unit" className="h-11 min-w-0 rounded-xl border border-[#d9e1d7] bg-white px-3 text-sm outline-none focus:border-[#35644f]" disabled={!sourcesReady || mutating} maxLength={100} onChange={(event) => setManualUnit(event.target.value)} placeholder="Unit" value={manualUnit} />
              <button className="h-11 rounded-xl bg-[#35644f] px-4 text-sm font-bold text-white hover:bg-[#2d5644] disabled:opacity-50" disabled={!sourcesReady || mutating || allLines.length >= MAX_GROCERY_ITEMS} type="submit">Add item</button>
            </div>
            {manualError ? <p className="mt-2 text-sm text-red-800" role="alert">{manualError}</p> : null}
          </form>
          <div className="mt-5 border-t border-[#e8e9e1] pt-5">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#7b887e]">Or add from</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
            <RecipePickerDialog
              disabled={!selectedListId || mutating || (!initialized && recipeLoadState !== "error")}
              onCommit={(recipes) => {
                commitRecipes(recipes);
                requestAnimationFrame(closeAddItemDialog);
              }}
              onLoadStateChange={handleRecipeLoadStateChange}
              pantryItems={pantryItems}
              pantryStatus={pantryLoadState}
              selectedRecipes={manualRecipes}
            />
            <PantryPickerDialog
              disabled={!selectedListId || mutating || (!initialized && pantryLoadState !== "error")}
              onCommit={(items) => {
                commitPantryItems(items);
                requestAnimationFrame(closeAddItemDialog);
              }}
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
            </div>
        </div>
          </div>
        </dialog>
      ) : null}

      {selectedListId ? (
        <section aria-labelledby="grocery-items-title" className="rounded-[1.5rem] border border-[#e2e4da] bg-white p-5 shadow-[0_12px_32px_rgba(36,52,43,0.04)] sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              {isRenamingList ? (
                <form className="flex flex-wrap gap-2" onSubmit={(event) => void renameList(event)}>
                  <input autoFocus aria-label="List name" className="h-10 min-w-0 rounded-lg border border-[#cbd5cb] px-3" maxLength={100} onChange={(event) => setListName(event.target.value)} required value={listName} />
                  <button className="rounded-lg bg-[#35644f] px-3 text-sm font-bold text-white" disabled={listActionBusy} type="submit">Save name</button>
                  <button className="rounded-lg px-2 text-sm text-[#69766c]" onClick={() => setIsRenamingList(false)} type="button">Cancel</button>
                </form>
              ) : (
                <p className="truncate [font-family:Georgia,serif] text-[2rem] font-bold leading-tight text-[#24342b] sm:text-[2rem]">
                  {loadedList?.name ?? lists.find((list) => list.id === selectedListId)?.name ?? "Grocery list"}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isRenamingList ? <button className="rounded-lg px-3 py-2 text-sm font-semibold text-[#35644f] hover:bg-[#edf3ed] disabled:opacity-50" disabled={listActionBusy || mutating || listLoadState !== "ready"} onClick={() => { setListName(loadedList?.name ?? ""); setIsRenamingList(true); setIsCreatingList(false); }} type="button">Rename</button> : null}
              <button className="rounded-lg px-3 py-2 text-sm font-semibold text-[#9b4f40] hover:bg-[#f8ebe5] disabled:opacity-50" disabled={listActionBusy || mutating || listLoadState !== "ready"} onClick={() => void deleteList()} type="button">Delete list</button>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2
              className="[font-family:Georgia,serif] text-xl font-bold leading-tight text-[#24342b]"
              data-grocery-items-heading
              id="grocery-items-title"
              tabIndex={-1}
            >
              Items to buy
            </h2>
            {visibleLines.length ? (
              <span className="text-sm font-semibold text-[#78837b]" role="status">
                {purchasedCount} of {visibleLines.length} purchased
              </span>
            ) : null}
          </div>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <button
              aria-haspopup="dialog"
              className="min-h-10 rounded-xl bg-[#35644f] px-4 text-sm font-bold text-white transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:opacity-50"
              disabled={listLoadState !== "ready" || mutating}
              onClick={openAddItemDialog}
              ref={addItemTriggerRef}
              type="button"
            >
              + Add item
            </button>
            {initialized ? (
              <button
                className="min-h-10 rounded-xl bg-[#35644f] px-4 text-sm font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.12)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!dirty || !sourcesReady || mutating}
                onClick={() => void saveList()}
                type="button"
              >
                {saving ? "Saving..." : "Save list"}
              </button>
            ) : null}
            {dirty ? (
              <span className="text-sm font-semibold text-[#9b5f34]">
                Unsaved changes
              </span>
            ) : null}
          </div>
          {visibleLines.length ? (
            <p className="mb-4 text-sm text-[#6f7a71]">
              Adjust quantities, check off what you buy, then save your changes.
            </p>
          ) : null}
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
                {!initialized
                  ? "Your items will appear when your recipes and pantry are ready."
                  : noSources
                    ? "Use Add item above to type an item or choose from your pantry and recipes."
                    : "Your pantry covers the selected recipes, or all generated items have been removed."}
              </p>
            </div>
          )}
          {dismissedLines.length ? (
            <div className="mt-5 rounded-xl border border-[#e5e1d8] bg-white px-4 py-3">
              <h3 className="text-sm font-bold text-[#24342b]">Removed items</h3>
              <p className="mt-1 text-xs text-[#6f7a71]">
                Restore an item if you still need to buy it.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {dismissedLines.map((line) => (
                  <li className="flex items-center gap-2 rounded-lg bg-[#f5f3ed] px-3 py-2 text-sm" key={line.id}>
                    <span>{line.name}</span>
                    <button
                      aria-label={`Restore ${line.name} to grocery list`}
                      className="font-bold text-[#35644f] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:opacity-50"
                      disabled={mutating}
                      onClick={() => restoreLine(line)}
                      type="button"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
      </div>
    </div>
  );
}
