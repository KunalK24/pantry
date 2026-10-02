"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import CreateRecipeDialog from "@/components/CreateRecipeDialog";
import {
  calculateRecipeAvailability,
  type PantryItemForGroceryList,
  type RecipeForGroceryList,
} from "@/lib/grocery-list";

type RecipeSummary = RecipeForGroceryList & {
  description: string | null;
  updatedAt: string;
};

type LibraryResponse = { recipes: RecipeSummary[] };
type PantryResponse = { items: PantryItemForGroceryList[] };

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

function isRecipeSummary(value: unknown): value is RecipeSummary {
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

function isPantryItem(value: unknown): value is PantryItemForGroceryList {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "quantity" in value &&
    isNullableString(value.quantity) &&
    "unit" in value &&
    isNullableString(value.unit)
  );
}

function isPantryResponse(payload: unknown): payload is PantryResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "items" in payload &&
    Array.isArray(payload.items) &&
    payload.items.every(isPantryItem)
  );
}

function isLibraryResponse(payload: unknown): payload is LibraryResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "recipes" in payload &&
    Array.isArray(payload.recipes) &&
    payload.recipes.every(isRecipeSummary)
  );
}

export default function RecipeLibrary() {
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);
  const [pantryItems, setPantryItems] = useState<
    PantryItemForGroceryList[] | null
  >(null);
  const [pantryError, setPantryError] = useState(false);
  const [pantryRequestNumber, setPantryRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/recipes", { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isLibraryResponse(payload)) {
          throw new Error("Unable to load your recipes.");
        }

        setRecipes(payload.recipes);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setRecipes(null);
        setError("Unable to load your recipes. Please try again.");
      });

    return () => controller.abort();
  }, [requestNumber]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/pantry-items", { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isPantryResponse(payload)) {
          throw new Error("Unable to load pantry availability.");
        }

        setPantryItems(payload.items);
        setPantryError(false);
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setPantryItems(null);
        setPantryError(true);
      });

    return () => controller.abort();
  }, [pantryRequestNumber]);

  function retry() {
    setRecipes(null);
    setError(null);
    setRequestNumber((current) => current + 1);
  }

  function refreshAfterCreation() {
    setRecipes(null);
    setError(null);
    setRequestNumber((current) => current + 1);
  }

  function retryPantry() {
    setPantryItems(null);
    setPantryError(false);
    setPantryRequestNumber((current) => current + 1);
  }

  let libraryContent;

  if (error) {
    libraryContent = (
      <div className="space-y-4" role="alert">
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        <button
          className="border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          onClick={retry}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  } else if (recipes === null) {
    libraryContent = (
      <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
        Loading recipes...
      </p>
    );
  } else if (recipes.length === 0) {
    libraryContent = (
      <p className="text-zinc-600 dark:text-zinc-400">
        You have not created any recipes yet.
      </p>
    );
  } else {
    libraryContent = (
      <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {recipes.map((recipe) => {
          const availability = pantryItems
            ? calculateRecipeAvailability(recipe, pantryItems)
            : null;

          return (
            <li key={recipe.id}>
              <Link
                className="grid gap-2 px-1 py-5 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3"
                href={`/recipes/${recipe.id}/edit`}
              >
                <div className="min-w-0">
                  <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">
                    {recipe.name}
                  </h2>
                  {recipe.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {recipe.description}
                    </p>
                  ) : null}
                  {availability ? (
                    <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      {availability.available}/{availability.total} ingredients
                      available
                    </p>
                  ) : !pantryError ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      Checking pantry availability...
                    </p>
                  ) : null}
                </div>
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Edit recipe
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CreateRecipeDialog onRecipeCreated={refreshAfterCreation} />
      </div>
      {pantryError ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Pantry availability could not be loaded. Recipes are still available.
          </p>
          <button
            className="border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            onClick={retryPantry}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}
      {libraryContent}
    </div>
  );
}
