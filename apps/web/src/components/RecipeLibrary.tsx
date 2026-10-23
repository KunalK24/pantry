"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import CreateRecipeDialog from "@/components/CreateRecipeDialog";
import ImportRecipeDialog from "@/components/ImportRecipeDialog";
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecipes() {
      try {
        const response = await fetch("/api/recipes", {
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isLibraryResponse(payload)) {
          throw new Error("Unable to load your recipes.");
        }

        setRecipes(payload.recipes);
        setError(null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setRecipes(null);
        setError("Unable to load your recipes. Please try again.");
      }
    }

    void loadRecipes();

    return () => controller.abort();
  }, [requestNumber]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPantryItems() {
      try {
        const response = await fetch("/api/pantry-items", {
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isPantryResponse(payload)) {
          throw new Error("Unable to load pantry availability.");
        }

        setPantryItems(payload.items);
        setPantryError(false);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setPantryItems(null);
        setPantryError(true);
      }
    }

    void loadPantryItems();

    return () => controller.abort();
  }, [pantryRequestNumber]);

  function retry() {
    setRecipes(null);
    setError(null);
    setRequestNumber((current) => current + 1);
  }

  function retryPantry() {
    setPantryItems(null);
    setPantryError(false);
    setPantryRequestNumber((current) => current + 1);
  }

  async function handleDeleteRecipe(recipe: RecipeSummary) {
    if (deletingId !== null) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${recipe.name} from your recipe library?`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(recipe.id);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/recipes/${recipe.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);

        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to delete the recipe.";

        throw new Error(message);
      }

      setRecipes(
        (current) =>
          current?.filter((currentRecipe) => currentRecipe.id !== recipe.id) ??
          null,
      );
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete the recipe.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  const visibleRecipes = useMemo(() => {
    if (recipes === null) {
      return null;
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return recipes;
    }

    return recipes.filter((recipe) => {
      const searchableText = [
        recipe.name,
        recipe.description ?? "",
        ...recipe.ingredients.map((ingredient) => ingredient.name),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [recipes, searchQuery]);

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    setSearchQuery(event.target.value);
  }

  function thumbnailTone(recipe: RecipeSummary) {
    const tones = [
      "from-[#f3e1d6] to-[#d6e7db] text-[#9b5f4c]",
      "from-[#e6efe5] to-[#f7eadc] text-[#35644f]",
      "from-[#efe8d8] to-[#dde8ef] text-[#6c7558]",
      "from-[#f5e6df] to-[#e4eadf] text-[#b66f54]",
    ];
    const index =
      [...recipe.id].reduce(
        (sum, character) => sum + character.charCodeAt(0),
        0,
      ) % tones.length;

    return tones[index];
  }

  function recipeInitials(recipeName: string) {
    return recipeName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("");
  }

  let libraryContent;

  if (error) {
    libraryContent = (
      <div
        className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4"
        role="alert"
      >
        <p className="text-sm font-semibold text-red-800">{error}</p>
        <button
          className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-800 transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
          onClick={retry}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  } else if (recipes === null) {
    libraryContent = (
      <p
        className="rounded-2xl border border-[#e3dfd4] bg-white px-5 py-6 text-sm font-semibold text-[#69736b]"
        role="status"
      >
        Loading recipes...
      </p>
    );
  } else if (recipes.length === 0) {
    libraryContent = (
      <div className="rounded-2xl border border-dashed border-[#d8d3c8] bg-white px-5 py-8 text-center">
        <h2 className="[font-family:Georgia,serif] text-xl font-bold text-[#24342b]">
          Your recipe book is ready.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#6f7a71]">
          Create a recipe manually or import one from text, a URL, or an image.
        </p>
      </div>
    );
  } else if (visibleRecipes?.length === 0) {
    libraryContent = (
      <div className="rounded-2xl border border-dashed border-[#d8d3c8] bg-white px-5 py-8 text-center">
        <h2 className="[font-family:Georgia,serif] text-xl font-bold text-[#24342b]">
          No recipes found.
        </h2>
        <p className="mt-3 text-sm text-[#6f7a71]">
          Try searching by recipe name, description, or ingredient.
        </p>
      </div>
    );
  } else {
    libraryContent = (
      <ul className="divide-y divide-[#ebe7dd] border-y border-[#e5e1d8]">
        {visibleRecipes?.map((recipe) => {
          const availability = pantryItems
            ? calculateRecipeAvailability(recipe, pantryItems)
            : null;

          return (
            <li key={recipe.id}>
              <article className="grid gap-4 py-6 md:grid-cols-[7.5rem_minmax(0,1fr)_auto] md:items-center">
                <div
                  className={`flex aspect-[4/3] w-full max-w-36 items-center justify-center rounded-xl bg-gradient-to-br ${thumbnailTone(recipe)} shadow-inner md:w-32`}
                >
                  <span className="[font-family:Georgia,serif] text-3xl font-bold">
                    {recipeInitials(recipe.name) || "R"}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold uppercase tracking-[0.14em] text-[#c5745a]">
                      Recipe
                    </span>
                    <span aria-hidden="true" className="text-[#d6d0c4]">
                      •
                    </span>
                    <span className="font-semibold text-[#78837b]">
                      {recipe.ingredients.length}{" "}
                      {recipe.ingredients.length === 1
                        ? "ingredient"
                        : "ingredients"}
                    </span>
                  </div>
                  <h2 className="[font-family:Georgia,serif] text-[1.5rem] font-bold leading-tight text-[#24342b] md:text-[1.8rem]">
                    <Link
                      className="rounded-md transition-colors hover:text-[#35644f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#35644f]"
                      href={`/recipes/${recipe.id}/edit`}
                    >
                      {recipe.name}
                    </Link>
                  </h2>
                  {recipe.description ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#7b857d]">
                      {recipe.description}
                    </p>
                  ) : null}
                  {availability ? (
                    <p className="mt-3 text-xs font-bold text-[#35644f]">
                      {availability.available}/{availability.total} ingredients
                      available
                    </p>
                  ) : !pantryError ? (
                    <p className="mt-3 text-xs font-semibold text-[#8b958c]">
                      Checking pantry availability...
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Link
                    className="rounded-lg px-3 py-2 text-xs font-bold text-[#35644f] transition-colors hover:bg-[#e8f1e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
                    href={`/recipes/${recipe.id}/edit`}
                  >
                    Edit
                  </Link>
                  <button
                    aria-label={`Delete ${recipe.name}`}
                    className="rounded-lg px-3 py-2 text-xs font-bold text-[#9b4f40] transition-colors hover:bg-[#f6e8e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={deletingId === recipe.id}
                    onClick={() => void handleDeleteRecipe(recipe)}
                    type="button"
                  >
                    {deletingId === recipe.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[64rem]">
      <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c5745a]">
            Your collection
          </p>
          <h1 className="mt-3 [font-family:Georgia,serif] text-[3rem] font-bold leading-none tracking-normal text-[#24342b] sm:text-[3.6rem]">
            Recipe book
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-7 text-[#6f7a71]">
            The good ones, kept close. Save recipes you love and turn them into
            a plan.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 lg:justify-end">
          <ImportRecipeDialog
            onRecipeCreated={retry}
            triggerClassName="min-h-11 rounded-xl border border-[#d9d4c9] bg-white px-4 text-[0.9rem] font-bold text-[#35644f] shadow-[0_12px_25px_rgba(42,48,38,0.05)] transition-colors hover:bg-[#f4f1e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
          />
          <CreateRecipeDialog
            onRecipeCreated={retry}
            triggerClassName="min-h-11 rounded-xl bg-[#35644f] px-5 text-[0.9rem] font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.16)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
            triggerLabel="+ Add recipe"
          />
        </div>
      </header>

      <div className="mt-9 grid gap-4 border-b border-[#e5e1d8] pb-6 md:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)] md:items-end">
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-xl bg-[#e8f1e9] px-4 py-2.5 text-[0.9rem] font-bold text-[#285843]"
            type="button"
          >
            All recipes
          </button>
        </div>
        <div>
          <label className="sr-only" htmlFor="recipe-search">
            Search your recipes
          </label>
          <input
            className="h-11 w-full border-0 border-b border-[#d8d3c8] bg-transparent px-1 text-sm font-semibold text-[#24342b] outline-none placeholder:text-[#a0a69e] focus:border-[#35644f] focus:ring-0"
            id="recipe-search"
            onChange={handleSearchChange}
            placeholder="Search your recipes"
            type="search"
            value={searchQuery}
          />
        </div>
        {pantryError ? (
          <div
            className="md:col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold text-[#8a6b2f]"
            role="alert"
          >
            <span>
              Pantry availability could not be loaded. Recipes are still
              available.
            </span>
            <button
              className="rounded-md text-[#35644f] underline decoration-[#b9c7b8] underline-offset-4 transition-colors hover:text-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
              onClick={retryPantry}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-7">
        {deleteError ? (
          <p
            className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
            role="alert"
          >
            {deleteError}
          </p>
        ) : null}
        {libraryContent}
      </div>
    </div>
  );
}
