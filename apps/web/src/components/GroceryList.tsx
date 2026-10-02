"use client";

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
  type PantryItemForGroceryList,
} from "@/lib/grocery-list";

type LineEdit = {
  quantity: string;
  unit: string;
};

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
  const [allRecipes, setAllRecipes] = useState<RecipePickerOption[]>([]);
  const [recipeLoadState, setRecipeLoadState] =
    useState<RecipePickerLoadState["status"]>("loading");
  const [lineEdits, setLineEdits] = useState<Record<string, LineEdit>>({});
  const [checkedLineIds, setCheckedLineIds] = useState<Set<string>>(new Set());
  const [dismissedLineIds, setDismissedLineIds] = useState<Set<string>>(
    new Set(),
  );

  const sourcesReady = pantryLoadState === "ready";

  const calculatedLines = useMemo(
    () =>
      sourcesReady
        ? calculateGroceryLines(
            selectedRecipes,
            pantryItems,
            new Set(selectedPantryItems.map((item) => item.id)),
          )
        : [],
    [pantryItems, selectedPantryItems, selectedRecipes, sourcesReady],
  );

  useEffect(() => {
    if (sourcesReady) {
      lastReadyCalculatedLinesRef.current = calculatedLines;
    }
  }, [calculatedLines, sourcesReady]);

  const visibleLines = useMemo(
    () => calculatedLines.filter((line) => !dismissedLineIds.has(line.id)),
    [calculatedLines, dismissedLineIds],
  );
  const recipeNames = new Map(
    selectedRecipes.map((recipe) => [recipe.id, recipe.name]),
  );
  const pantryNames = new Map(
    selectedPantryItems.map((item) => [item.id, item.name]),
  );
  const recommendationsReady =
    recipeLoadState === "ready" && pantryLoadState === "ready";
  const selectedRecipeIds = useMemo(
    () => new Set(selectedRecipes.map((recipe) => recipe.id)),
    [selectedRecipes],
  );
  const matchingRecommendations = useMemo(
    () =>
      recommendationsReady
        ? calculateRecipeRecommendations(
            allRecipes,
            pantryItems,
            visibleLines,
            new Set(),
          )
        : [],
    [allRecipes, pantryItems, recommendationsReady, visibleLines],
  );
  const recommendations = useMemo(
    () =>
      matchingRecommendations.filter(
        (recommendation) => !selectedRecipeIds.has(recommendation.recipe.id),
      ),
    [matchingRecommendations, selectedRecipeIds],
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

  const handleRecipeLoadStateChange = useCallback(
    (state: RecipePickerLoadState) => {
      setRecipeLoadState(state.status);

      if (state.status === "ready") {
        setAllRecipes(state.recipes);
        const recipesById = new Map(
          state.recipes.map((recipe) => [recipe.id, recipe]),
        );
        setSelectedRecipes((current) =>
          current
            .map((recipe) => recipesById.get(recipe.id))
            .filter((recipe): recipe is RecipePickerOption => Boolean(recipe)),
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

  function addRecommendedRecipe(id: string) {
    if (selectedRecipeIds.has(id)) return;

    const recipe = allRecipes.find((candidate) => candidate.id === id);
    if (!recipe) return;

    reconcileSourceChange();
    setSelectedRecipes((current) => [...current, recipe]);
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
  const recommendationEmptyMessage =
    allRecipes.length === 0
      ? "Create a recipe to receive recommendations."
      : pantryItems.length === 0 && visibleLines.length === 0
        ? "Add pantry items or grocery items to receive recommendations."
        : matchingRecommendations.length > 0 && recommendations.length === 0
          ? "All matching recipes are already on your grocery list."
          : "No recipes match your pantry or current grocery list.";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <RecipePickerDialog
          onCommit={commitRecipes}
          onLoadStateChange={handleRecipeLoadStateChange}
          pantryItems={pantryItems}
          pantryStatus={pantryLoadState}
          selectedRecipes={selectedRecipes}
        />
        <PantryPickerDialog
          onCommit={commitPantryItems}
          onLoadStateChange={handlePantryLoadStateChange}
          selectedItems={selectedPantryItems}
        />
        <RecipeRecommendationsDialog
          disabled={!recommendationsReady}
          emptyMessage={recommendationEmptyMessage}
          onAddRecipe={addRecommendedRecipe}
          recommendations={recommendations}
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

      {recipeLoadState === "loading" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
          Loading recipes for recommendations...
        </p>
      ) : null}

      {recipeLoadState === "error" ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          Recommendations are unavailable. Open Add from Recipes and try again.
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
                  : "Your pantry covers the selected recipes, or all generated items have been removed."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
