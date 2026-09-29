"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PantryPickerDialog, {
  type PantryPickerLoadState,
  type PantryPickerOption,
} from "@/components/PantryPickerDialog";
import RecipePickerDialog, {
  type RecipePickerOption,
} from "@/components/RecipePickerDialog";
import {
  calculateGroceryLines,
  type GroceryLineCalculation,
  type PantryItemForGroceryList,
  type RecipeForGroceryList,
} from "@/lib/grocery-list";

type RecipeDetailResponse = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  ingredients: Array<{
    name: string;
    quantity: string | null;
    unit: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

type LineEdit = {
  quantity: string;
  unit: string;
};

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isRecipeDetailResponse(
  payload: unknown,
): payload is RecipeDetailResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    typeof payload.id === "string" &&
    "name" in payload &&
    typeof payload.name === "string" &&
    "description" in payload &&
    isNullableString(payload.description) &&
    "instructions" in payload &&
    isNullableString(payload.instructions) &&
    "ingredients" in payload &&
    Array.isArray(payload.ingredients) &&
    payload.ingredients.every(
      (ingredient) =>
        typeof ingredient === "object" &&
        ingredient !== null &&
        "name" in ingredient &&
        typeof ingredient.name === "string" &&
        "quantity" in ingredient &&
        isNullableString(ingredient.quantity) &&
        "unit" in ingredient &&
        isNullableString(ingredient.unit),
    ) &&
    "createdAt" in payload &&
    typeof payload.createdAt === "string" &&
    "updatedAt" in payload &&
    typeof payload.updatedAt === "string"
  );
}

function sourceDescription(
  line: GroceryLineCalculation,
  recipeNames: Map<string, string>,
  pantryNames: Map<string, string>,
) {
  const recipes = line.recipeIds
    .map((id) => recipeNames.get(id))
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

function haveSameIds(
  current: Array<{ id: string }>,
  next: Array<{ id: string }>,
) {
  if (current.length !== next.length) {
    return false;
  }

  const currentIds = new Set(current.map((item) => item.id));
  return next.every((item) => currentIds.has(item.id));
}

function manualLineIds(
  lines: GroceryLineCalculation[],
  allowedPantryIds?: Set<string>,
) {
  return new Set(
    lines
      .filter(
        (line) =>
          line.calculation === "manual" &&
          (!allowedPantryIds ||
            (line.pantryItemId && allowedPantryIds.has(line.pantryItemId))),
      )
      .map((line) => line.id),
  );
}

export default function GroceryList() {
  const recipeCache = useRef(new Map<string, RecipeForGroceryList>());
  const lastReadyCalculatedLinesRef = useRef<GroceryLineCalculation[]>([]);
  const pantryLoadStateRef = useRef<PantryPickerLoadState["status"]>(
    "loading",
  );
  const [selectedRecipes, setSelectedRecipes] = useState<RecipePickerOption[]>(
    [],
  );
  const [selectedPantryItems, setSelectedPantryItems] = useState<
    PantryPickerOption[]
  >([]);
  const [pantryItems, setPantryItems] = useState<PantryItemForGroceryList[]>(
    [],
  );
  const [pantryLoadState, setPantryLoadState] =
    useState<PantryPickerLoadState["status"]>("loading");
  const [recipeDetails, setRecipeDetails] = useState<
    Record<string, RecipeForGroceryList>
  >({});
  const [recipeErrors, setRecipeErrors] = useState<Record<string, string>>({});
  const [recipeRetry, setRecipeRetry] = useState(0);
  const [lineEdits, setLineEdits] = useState<Record<string, LineEdit>>({});
  const [checkedLineIds, setCheckedLineIds] = useState<Set<string>>(new Set());
  const [dismissedLineIds, setDismissedLineIds] = useState<Set<string>>(
    new Set(),
  );

  const selectedRecipeKey = selectedRecipes
    .map((recipe) => recipe.id)
    .sort()
    .join("|");

  useEffect(() => {
    const selectedIds = new Set(selectedRecipes.map((recipe) => recipe.id));
    const controllers: AbortController[] = [];
    let active = true;

    for (const recipe of selectedRecipes) {
      const cached = recipeCache.current.get(recipe.id);

      if (cached) {
        setRecipeDetails((current) =>
          current[recipe.id]
            ? current
            : { ...current, [recipe.id]: cached },
        );
        continue;
      }

      const controller = new AbortController();
      controllers.push(controller);

      fetch(`/api/recipes/${recipe.id}`, { signal: controller.signal })
        .then(async (response) => {
          const payload: unknown = await response.json().catch(() => null);

          if (!response.ok || !isRecipeDetailResponse(payload)) {
            throw new Error(`Unable to load ${recipe.name}.`);
          }

          if (!active || !selectedIds.has(recipe.id)) return;

          const detail: RecipeForGroceryList = {
            id: payload.id,
            name: payload.name,
            ingredients: payload.ingredients,
          };
          recipeCache.current.set(recipe.id, detail);
          setRecipeDetails((current) => ({
            ...current,
            [recipe.id]: detail,
          }));
          setRecipeErrors((current) => {
            const next = { ...current };
            delete next[recipe.id];
            return next;
          });
        })
        .catch((requestError: unknown) => {
          if (
            requestError instanceof DOMException &&
            requestError.name === "AbortError"
          ) {
            return;
          }

          if (!active || !selectedIds.has(recipe.id)) return;

          setRecipeErrors((current) => ({
            ...current,
            [recipe.id]: `Unable to load ${recipe.name}. Please try again.`,
          }));
        });
    }

    return () => {
      active = false;
      controllers.forEach((controller) => controller.abort());
    };
  }, [recipeRetry, selectedRecipeKey, selectedRecipes]);

  const loadedRecipes = useMemo(
    () =>
      selectedRecipes
        .map((recipe) => recipeDetails[recipe.id])
        .filter((recipe): recipe is RecipeForGroceryList => Boolean(recipe)),
    [recipeDetails, selectedRecipes],
  );

  const hasPendingRecipes = selectedRecipes.some(
    (recipe) => !recipeDetails[recipe.id] && !recipeErrors[recipe.id],
  );
  const hasRecipeErrors = selectedRecipes.some(
    (recipe) => recipeErrors[recipe.id],
  );
  const sourcesReady =
    pantryLoadState === "ready" &&
    !hasPendingRecipes &&
    !hasRecipeErrors;

  const calculatedLines = useMemo(
    () =>
      sourcesReady
        ? calculateGroceryLines(
            loadedRecipes,
            pantryItems,
            new Set(selectedPantryItems.map((item) => item.id)),
          )
        : [],
    [loadedRecipes, pantryItems, selectedPantryItems, sourcesReady],
  );

  useEffect(() => {
    if (sourcesReady) {
      lastReadyCalculatedLinesRef.current = calculatedLines;
    }
  }, [calculatedLines, sourcesReady]);

  const visibleLines = calculatedLines.filter(
    (line) => !dismissedLineIds.has(line.id),
  );
  const recipeNames = new Map(
    selectedRecipes.map((recipe) => [recipe.id, recipe.name]),
  );
  const pantryNames = new Map(
    selectedPantryItems.map((item) => [item.id, item.name]),
  );

  function reconcileSourceChange(allowedPantryIds?: Set<string>) {
    const retainedLineIds = manualLineIds(
      lastReadyCalculatedLinesRef.current,
      allowedPantryIds,
    );

    setLineEdits((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => retainedLineIds.has(id)),
      ),
    );
    setCheckedLineIds(new Set());
    setDismissedLineIds(new Set());
  }

  function commitRecipes(recipes: RecipePickerOption[]) {
    if (haveSameIds(selectedRecipes, recipes)) {
      return;
    }

    reconcileSourceChange();
    setSelectedRecipes(recipes);
  }

  function commitPantryItems(items: PantryPickerOption[]) {
    if (haveSameIds(selectedPantryItems, items)) {
      return;
    }

    reconcileSourceChange(new Set(items.map((item) => item.id)));
    setSelectedPantryItems(items);
  }

  const handlePantryLoadStateChange = useCallback(
    (state: PantryPickerLoadState) => {
      if (
        state.status === "loading" &&
        pantryLoadStateRef.current !== "loading"
      ) {
        const retainedLineIds = manualLineIds(
          lastReadyCalculatedLinesRef.current,
        );
        setLineEdits((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([id]) => retainedLineIds.has(id)),
          ),
        );
        setCheckedLineIds(new Set());
        setDismissedLineIds(new Set());
      }

      pantryLoadStateRef.current = state.status;
      setPantryLoadState(state.status);

      if (state.status === "ready") {
        setPantryItems(
          state.items.map(({ id, name, quantity, unit }) => ({
            id,
            name,
            quantity,
            unit,
          })),
        );
      }
    },
    [],
  );

  function removeRecipe(id: string) {
    reconcileSourceChange();
    setSelectedRecipes((current) =>
      current.filter((recipe) => recipe.id !== id),
    );
  }

  function removePantryItem(id: string) {
    const nextItems = selectedPantryItems.filter((item) => item.id !== id);
    reconcileSourceChange(new Set(nextItems.map((item) => item.id)));
    setSelectedPantryItems(nextItems);
  }

  function retryRecipe(id: string) {
    const retainedLineIds = manualLineIds(
      lastReadyCalculatedLinesRef.current,
      new Set(selectedPantryItems.map((item) => item.id)),
    );
    setLineEdits((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([lineId]) =>
          retainedLineIds.has(lineId),
        ),
      ),
    );
    setCheckedLineIds(new Set());
    setDismissedLineIds(new Set());
    recipeCache.current.delete(id);
    setRecipeDetails((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setRecipeErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setRecipeRetry((current) => current + 1);
  }

  function updateLine(id: string, edit: LineEdit) {
    setLineEdits((current) => ({
      ...current,
      [id]: edit,
    }));
  }

  function toggleLine(id: string) {
    setCheckedLineIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function dismissLine(id: string) {
    setDismissedLineIds((current) => new Set(current).add(id));
  }

  const noSources =
    selectedRecipes.length === 0 && selectedPantryItems.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <RecipePickerDialog
          onCommit={commitRecipes}
          selectedRecipes={selectedRecipes}
        />
        <PantryPickerDialog
          onCommit={commitPantryItems}
          onLoadStateChange={handlePantryLoadStateChange}
          selectedItems={selectedPantryItems}
        />
      </div>

      {selectedRecipes.length || selectedPantryItems.length ? (
        <div className="grid gap-6 border-y border-zinc-200 py-5 dark:border-zinc-800 md:grid-cols-2">
          {selectedRecipes.length ? (
            <section aria-labelledby="selected-recipes-title">
              <h2
                className="text-sm font-semibold text-zinc-950 dark:text-zinc-50"
                id="selected-recipes-title"
              >
                Recipes
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {selectedRecipes.map((recipe) => (
                  <li
                    className="flex max-w-full items-center gap-2 border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
                    key={recipe.id}
                  >
                    <span className="truncate">{recipe.name}</span>
                    <button
                      aria-label={`Remove ${recipe.name} from grocery list sources`}
                      className="font-medium text-zinc-500 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:text-zinc-400 dark:hover:text-red-400"
                      onClick={() => removeRecipe(recipe.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {selectedPantryItems.length ? (
            <section aria-labelledby="selected-pantry-title">
              <h2
                className="text-sm font-semibold text-zinc-950 dark:text-zinc-50"
                id="selected-pantry-title"
              >
                Pantry items
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {selectedPantryItems.map((item) => (
                  <li
                    className="flex max-w-full items-center gap-2 border border-emerald-700/50 px-3 py-1.5 text-sm dark:border-emerald-500/50"
                    key={item.id}
                  >
                    <span className="truncate">{item.name}</span>
                    <button
                      aria-label={`Remove ${item.name} from grocery list sources`}
                      className="font-medium text-emerald-700 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:text-emerald-400 dark:hover:text-red-400"
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

      {Object.entries(recipeErrors).map(([id, message]) =>
        selectedRecipes.some((recipe) => recipe.id === id) ? (
          <div className="flex flex-wrap items-center gap-3" key={id} role="alert">
            <p className="text-sm text-red-700 dark:text-red-400">{message}</p>
            <button
              className="border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              onClick={() => retryRecipe(id)}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : null,
      )}

      {pantryLoadState === "loading" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
          Loading pantry data before calculating your grocery list...
        </p>
      ) : null}

      {pantryLoadState === "error" ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          Unable to load pantry data. Open Add from Pantry and try again.
        </p>
      ) : null}

      {hasPendingRecipes ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
          Calculating recipe ingredients...
        </p>
      ) : null}

      <section aria-labelledby="grocery-items-title">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2
            className="text-lg font-semibold text-zinc-950 dark:text-zinc-50"
            id="grocery-items-title"
          >
            Items to buy
          </h2>
          {visibleLines.length ? (
            <span className="text-sm text-zinc-500">
              {visibleLines.length} {visibleLines.length === 1 ? "item" : "items"}
            </span>
          ) : null}
        </div>

        {visibleLines.length ? (
          <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {visibleLines.map((line, index) => {
              const edit = lineEdits[line.id] ?? {
                quantity: line.quantity,
                unit: line.unit,
              };
              const checked = checkedLineIds.has(line.id);
              const source = sourceDescription(line, recipeNames, pantryNames);

              return (
                <li
                  className="grid gap-4 py-5 sm:grid-cols-[auto_minmax(0,1fr)_minmax(7rem,0.45fr)_minmax(7rem,0.45fr)_auto] sm:items-end"
                  key={line.id}
                >
                  <div className="flex items-center sm:h-10">
                    <input
                      aria-label={`Mark ${line.name} as purchased`}
                      checked={checked}
                      className="size-5 accent-zinc-950 dark:accent-zinc-100"
                      onChange={() => toggleLine(line.id)}
                      type="checkbox"
                    />
                  </div>

                  <div className="min-w-0 self-center">
                    <p
                      className={`font-medium ${
                        checked
                          ? "text-zinc-500 line-through"
                          : "text-zinc-950 dark:text-zinc-50"
                      }`}
                    >
                      {line.name}
                    </p>
                    {source ? (
                      <p className="mt-1 text-xs text-zinc-500">{source}</p>
                    ) : null}
                    {line.warning ? (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        {line.warning}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
                      htmlFor={`grocery-quantity-${index}`}
                    >
                      Quantity
                    </label>
                    <input
                      className="mt-1 h-10 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                      id={`grocery-quantity-${index}`}
                      onChange={(event) =>
                        updateLine(line.id, {
                          ...edit,
                          quantity: event.target.value,
                        })
                      }
                      type="text"
                      value={edit.quantity}
                    />
                  </div>

                  <div>
                    <label
                      className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
                      htmlFor={`grocery-unit-${index}`}
                    >
                      Unit
                    </label>
                    <input
                      className="mt-1 h-10 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                      id={`grocery-unit-${index}`}
                      onChange={(event) =>
                        updateLine(line.id, {
                          ...edit,
                          unit: event.target.value,
                        })
                      }
                      type="text"
                      value={edit.unit}
                    />
                  </div>

                  <button
                    aria-label={`Remove ${line.name} from grocery list`}
                    className="h-10 border border-red-300 px-3 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                    onClick={() => dismissLine(line.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="border-y border-zinc-200 py-8 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {noSources
                ? pantryLoadState === "loading"
                  ? "Waiting for pantry data before building your grocery list."
                  : pantryLoadState === "error"
                    ? "Pantry data must load before a grocery list can be calculated."
                    : "Add recipes or low pantry items to start your grocery list."
                : pantryLoadState === "loading"
                  ? "Waiting for pantry data before calculating your grocery list."
                  : pantryLoadState === "error"
                    ? "Pantry data must load before a grocery list can be calculated."
                : hasPendingRecipes
                  ? "Your grocery list will appear when the selected recipes finish loading."
                  : hasRecipeErrors
                    ? "Retry the recipe loading errors to finish your grocery list."
                  : "Your pantry covers the selected recipes, or all generated items have been removed."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
