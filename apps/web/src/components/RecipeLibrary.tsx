"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RecipeSummary = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
};

type LibraryResponse = { recipes: RecipeSummary[] };

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
    typeof value.updatedAt === "string"
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

  function retry() {
    setRecipes(null);
    setError(null);
    setRequestNumber((current) => current + 1);
  }

  if (error) {
    return (
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
  }

  if (recipes === null) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
        Loading recipes...
      </p>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-zinc-600 dark:text-zinc-400">
          You have not created any recipes yet.
        </p>
        <Link
          className="inline-block bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          href="/recipes/new"
        >
          Create recipe
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {recipes.map((recipe) => (
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
            </div>
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Edit recipe
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
