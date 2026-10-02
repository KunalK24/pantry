"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  calculateRecipeAvailability,
  type PantryItemForGroceryList,
  type RecipeForGroceryList,
} from "@/lib/grocery-list";

export type RecipePickerOption = RecipeForGroceryList & {
  description: string | null;
  updatedAt: string;
};

export type RecipePickerLoadState =
  | { status: "loading" }
  | { status: "ready"; recipes: RecipePickerOption[] }
  | { status: "error" };

type RecipeLibraryResponse = { recipes: RecipePickerOption[] };

type RecipePickerDialogProps = {
  selectedRecipes: RecipePickerOption[];
  onCommit: (recipes: RecipePickerOption[]) => void;
  onLoadStateChange: (state: RecipePickerLoadState) => void;
  pantryItems: PantryItemForGroceryList[];
  pantryStatus: "loading" | "ready" | "error";
};

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isIngredient(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "quantity" in value &&
    isNullableString(value.quantity) &&
    "unit" in value &&
    isNullableString(value.unit)
  );
}

function isRecipeOption(value: unknown): value is RecipePickerOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "description" in value &&
    (typeof value.description === "string" || value.description === null) &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string" &&
    "ingredients" in value &&
    Array.isArray(value.ingredients) &&
    value.ingredients.every(isIngredient)
  );
}

function isRecipeLibraryResponse(
  payload: unknown,
): payload is RecipeLibraryResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "recipes" in payload &&
    Array.isArray(payload.recipes) &&
    payload.recipes.every(isRecipeOption)
  );
}

export default function RecipePickerDialog({
  selectedRecipes,
  onCommit,
  onLoadStateChange,
  pantryItems,
  pantryStatus,
}: RecipePickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [recipes, setRecipes] = useState<RecipePickerOption[] | null>(null);
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    onLoadStateChange({ status: "loading" });

    fetch("/api/recipes", { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isRecipeLibraryResponse(payload)) {
          throw new Error("Unable to load your recipes.");
        }

        if (!active) return;

        setRecipes(payload.recipes);
        onLoadStateChange({ status: "ready", recipes: payload.recipes });
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        if (!active) return;

        setRecipes(null);
        setError("Unable to load your recipes. Please try again.");
        onLoadStateChange({ status: "error" });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [onLoadStateChange, requestNumber]);

  const availabilityByRecipeId = useMemo(
    () =>
      new Map(
        (recipes ?? []).map((recipe) => [
          recipe.id,
          calculateRecipeAvailability(recipe, pantryItems),
        ]),
      ),
    [pantryItems, recipes],
  );

  function openDialog() {
    setDraftIds(new Set(selectedRecipes.map((recipe) => recipe.id)));
    dialogRef.current?.showModal();
    requestAnimationFrame(() => {
      (firstOptionRef.current ?? closeRef.current)?.focus();
    });
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleClose() {
    setDraftIds(new Set(selectedRecipes.map((recipe) => recipe.id)));
    triggerRef.current?.focus();
  }

  function toggleRecipe(id: string) {
    setDraftIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function commitSelection() {
    onCommit((recipes ?? []).filter((recipe) => draftIds.has(recipe.id)));
    closeDialog();
  }

  function retry() {
    setRecipes(null);
    setError(null);
    onLoadStateChange({ status: "loading" });
    setRequestNumber((current) => current + 1);
  }

  return (
    <>
      <button
        className="h-10 border border-zinc-300 px-4 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        Add from Recipes
      </button>

      <dialog
        aria-describedby="recipe-picker-description"
        aria-labelledby="recipe-picker-title"
        className="m-auto max-h-[min(38rem,calc(100dvh-2rem))] w-[min(34rem,calc(100vw-2rem))] border border-zinc-300 bg-white p-0 text-zinc-950 shadow-xl backdrop:bg-black/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        onClose={handleClose}
        ref={dialogRef}
      >
        <div className="flex max-h-[min(38rem,calc(100dvh-2rem))] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <div>
              <h2 className="text-lg font-semibold" id="recipe-picker-title">
                Add from Recipes
              </h2>
              <p
                className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
                id="recipe-picker-description"
              >
                Select recipes to calculate the ingredients you still need.
              </p>
            </div>
            <button
              aria-label="Close recipe picker"
              className="px-2 py-1 text-sm font-medium text-zinc-600 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:text-zinc-400 dark:hover:text-white dark:focus-visible:outline-zinc-100"
              onClick={closeDialog}
              ref={closeRef}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="min-h-28 flex-1 overflow-y-auto px-5 py-4">
            {error ? (
              <div className="space-y-3" role="alert">
                <p className="text-sm text-red-700 dark:text-red-400">
                  {error}
                </p>
                <button
                  className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  onClick={retry}
                  type="button"
                >
                  Try again
                </button>
              </div>
            ) : recipes === null ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
                Loading recipes...
              </p>
            ) : recipes.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                You have not created any recipes yet.
              </p>
            ) : (
              <fieldset>
                <legend className="sr-only">Recipes</legend>
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {recipes.map((recipe, index) => (
                    <li key={recipe.id}>
                      <label className="flex cursor-pointer items-start gap-3 py-3">
                        <input
                          checked={draftIds.has(recipe.id)}
                          className="mt-1 size-4 accent-zinc-950 dark:accent-zinc-100"
                          onChange={() => toggleRecipe(recipe.id)}
                          ref={index === 0 ? firstOptionRef : undefined}
                          type="checkbox"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {recipe.name}
                          </span>
                          {recipe.description ? (
                            <span className="mt-1 line-clamp-2 block text-sm text-zinc-600 dark:text-zinc-400">
                              {recipe.description}
                            </span>
                          ) : null}
                          {pantryStatus === "ready" ? (
                            <span className="mt-1 block text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              {availabilityByRecipeId.get(recipe.id)?.available ?? 0}/
                              {availabilityByRecipeId.get(recipe.id)?.total ?? 0}{" "}
                              ingredients available
                            </span>
                          ) : (
                            <span className="mt-1 block text-xs text-zinc-500">
                              {pantryStatus === "loading"
                                ? "Checking pantry availability..."
                                : "Pantry availability unavailable"}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <button
              className="border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              onClick={closeDialog}
              type="button"
            >
              Cancel
            </button>
            <button
              className="bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              disabled={recipes === null || error !== null}
              onClick={commitSelection}
              type="button"
            >
              Add selected
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
