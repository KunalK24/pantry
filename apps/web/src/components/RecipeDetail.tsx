"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import ActionIcon from "@/components/ActionIcon";
import FavoriteHeart from "@/components/FavoriteHeart";

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  instructions: string[];
  imageUrl: string | null;
  mealType: "breakfast" | "lunch" | "dinner" | "snack" | "dessert" | null;
  timeMinutes: number | null;
  isFavorite: boolean;
  ingredients: Array<{
    name: string;
    quantity: string | null;
    unit: string | null;
  }>;
};

const ABBREVIATED_UNITS: Readonly<Record<string, string>> = {
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  ounce: "oz",
  ounces: "oz",
  pound: "lb",
  pounds: "lb",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  milliliter: "ml",
  milliliters: "ml",
  liter: "L",
  liters: "L",
};

function displayIngredientAmount(ingredient: Recipe["ingredients"][number]): string {
  const unit = ingredient.unit?.trim() ?? "";
  return [ingredient.quantity?.trim(), ABBREVIATED_UNITS[unit.toLowerCase()] ?? unit]
    .filter(Boolean)
    .join(" ");
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isRecipe(value: unknown): value is Recipe {
  return (
    typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "name" in value && typeof value.name === "string" &&
    "description" in value && isNullableString(value.description) &&
    "instructions" in value && Array.isArray(value.instructions) && value.instructions.every((step) => typeof step === "string") &&
    "imageUrl" in value && isNullableString(value.imageUrl) &&
    "mealType" in value && (value.mealType === null || ["breakfast", "lunch", "dinner", "snack", "dessert"].includes(value.mealType as string)) &&
    "timeMinutes" in value && (value.timeMinutes === null || (typeof value.timeMinutes === "number" && Number.isSafeInteger(value.timeMinutes) && value.timeMinutes > 0)) &&
    "isFavorite" in value && typeof value.isFavorite === "boolean" &&
    "ingredients" in value && Array.isArray(value.ingredients) &&
    value.ingredients.every((ingredient) =>
      typeof ingredient === "object" && ingredient !== null &&
      "name" in ingredient && typeof ingredient.name === "string" &&
      "quantity" in ingredient && isNullableString(ingredient.quantity) &&
      "unit" in ingredient && isNullableString(ingredient.unit),
    )
  );
}

export default function RecipeDetail({ recipeId }: { recipeId: string }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);
  const [favoritePending, setFavoritePending] = useState(false);
  const favoritePendingRef = useRef(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecipe() {
      try {
        const response = await fetch(`/api/recipes/${recipeId}`, { signal: controller.signal });
        const payload: unknown = await response.json().catch(() => null);

        if (response.status === 404) {
          setRecipe(null);
          setError("Recipe not found.");
          return;
        }

        if (!response.ok || !isRecipe(payload)) {
          throw new Error("Unable to load this recipe. Please try again.");
        }

        setRecipe(payload);
        setError(null);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setRecipe(null);
        setError("Unable to load this recipe. Please try again.");
      }
    }

    void loadRecipe();
    return () => controller.abort();
  }, [recipeId, requestNumber]);

  function retry() {
    setRecipe(null);
    setError(null);
    setRequestNumber((current) => current + 1);
  }

  async function handleFavorite() {
    if (!recipe || favoritePendingRef.current) {
      return;
    }
    favoritePendingRef.current = true;
    setFavoritePending(true);
    setFavoriteError(null);
    setRecipe((current) => current ? { ...current, isFavorite: !recipe.isFavorite } : null);
    try {
      const response = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !recipe.isFavorite }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecipe(payload)) {
        throw new Error("Unable to update favorite. Please try again.");
      }
      setRecipe(payload);
    } catch (error) {
      setRecipe((current) => current ? { ...current, isFavorite: recipe.isFavorite } : null);
      setFavoriteError(error instanceof Error ? error.message : "Unable to update favorite. Please try again.");
    } finally {
      favoritePendingRef.current = false;
      setFavoritePending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link className="inline-flex rounded-lg text-sm font-bold text-[#35644f] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]" href="/recipes">
        ← Back to recipe book
      </Link>

      {error ? (
        <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-5" role="alert">
          <p className="font-semibold text-red-800">{error}</p>
          {error !== "Recipe not found." ? (
            <button className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800" onClick={retry} type="button">Try again</button>
          ) : null}
        </div>
      ) : recipe === null ? (
        <p className="mt-8 text-sm font-semibold text-[#69736b]" role="status">Loading recipe...</p>
      ) : (
        <article>
          <header className="mt-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="[font-family:Georgia,serif] text-[2.5rem] font-bold leading-tight text-[#24342b] sm:text-[3.5rem]">{recipe.name}</h1>
              {recipe.description ? <p className="mt-4 max-w-2xl whitespace-pre-line text-lg leading-7 text-[#6f7a71]">{recipe.description}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              <button aria-label={recipe.isFavorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={recipe.isFavorite} className="flex min-h-12 min-w-12 items-center justify-center rounded-lg text-[#c5745a] hover:bg-[#f6e8e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5745a]" disabled={favoritePending} onClick={() => void handleFavorite()} type="button"><FavoriteHeart className="h-7 w-7" filled={recipe.isFavorite} /></button>
              <Link aria-label={`Edit ${recipe.name}`} className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-[#d9d4c9] bg-white text-[#35644f] transition-colors hover:bg-[#f4f1e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]" href={`/recipes/${recipe.id}/edit`} title="Edit recipe"><ActionIcon action="edit" className="h-6 w-6" /></Link>
            </div>
          </header>
          {recipe.mealType || recipe.timeMinutes !== null ? <p className="mt-4 flex flex-wrap gap-3 text-sm font-semibold text-[#69736b]">{recipe.mealType ? <span className="capitalize text-[#c5745a]">{recipe.mealType}</span> : null}{recipe.timeMinutes !== null ? <span>◷ {recipe.timeMinutes} min</span> : null}</p> : null}
          {favoriteError ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">{favoriteError}</p> : null}

          {recipe.imageUrl ? (
            <Image alt={recipe.name} className="mt-8 aspect-[16/9] max-h-[32rem] w-full rounded-2xl object-cover" height={675} src={recipe.imageUrl} unoptimized width={1200} />
          ) : null}

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)]">
            <section aria-labelledby="recipe-ingredients">
              <h2 className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]" id="recipe-ingredients">Ingredients</h2>
              {recipe.ingredients.length ? (
                <ul className="mt-4 divide-y divide-[#e5e1d8] border-y border-[#e5e1d8]">
                  {recipe.ingredients.map((ingredient, index) => {
                    const amount = displayIngredientAmount(ingredient);
                    return (
                      <li className="py-3 text-sm leading-6" key={`${ingredient.name}-${index}`}>
                        {amount ? <><span className="font-semibold text-[#35644f]">{amount}</span>{" "}</> : null}
                        {ingredient.name}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="mt-4 text-sm text-[#6f7a71]">No ingredients added.</p>}
            </section>
            <section aria-labelledby="recipe-instructions">
              <h2 className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]" id="recipe-instructions">Instructions</h2>
              {recipe.instructions.length ? (
                <ol className="mt-4 list-decimal space-y-4 pl-6 text-base leading-8 text-[#34463a] marker:font-bold marker:text-[#35644f]">
                  {recipe.instructions.map((step, index) => (
                    <li className="whitespace-pre-wrap pl-2" key={index}>{step}</li>
                  ))}
                </ol>
              ) : <p className="mt-4 text-sm text-[#6f7a71]">No instructions added.</p>}
            </section>
          </div>
        </article>
      )}
    </div>
  );
}
