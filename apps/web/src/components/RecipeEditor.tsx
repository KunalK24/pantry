"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RecipeForm, { type RecipeFormValues } from "@/components/RecipeForm";

type RecipeResponse = Omit<
  RecipeFormValues,
  "instructions" | "ingredients"
> & {
  id: string;
  instructions: string | null;
  ingredients: Array<{
    name: string;
    quantity: string | null;
    unit: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

function isRecipeIngredient(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "quantity" in value &&
    (typeof value.quantity === "string" || value.quantity === null) &&
    "unit" in value &&
    (typeof value.unit === "string" || value.unit === null)
  );
}

function isRecipeResponse(payload: unknown): payload is RecipeResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    typeof payload.id === "string" &&
    "name" in payload &&
    typeof payload.name === "string" &&
    "instructions" in payload &&
    (typeof payload.instructions === "string" ||
      payload.instructions === null) &&
    "ingredients" in payload &&
    Array.isArray(payload.ingredients) &&
    payload.ingredients.every(isRecipeIngredient)
  );
}

function responseErrorMessage(payload: unknown, status: number) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return status === 404
    ? "Recipe not found."
    : "Unable to load this recipe. Please try again.";
}

export default function RecipeEditor({ recipeId }: { recipeId: string }) {
  const [recipe, setRecipe] = useState<RecipeFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/recipes/${recipeId}`, { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(responseErrorMessage(payload, response.status));
        }

        if (!isRecipeResponse(payload)) {
          throw new Error("Unable to load this recipe. Please try again.");
        }

        setRecipe({
          name: payload.name,
          description: payload.description ?? "",
          instructions: payload.instructions ?? "",
          ingredients: payload.ingredients.map((ingredient) => ({
            name: ingredient.name,
            quantity: ingredient.quantity ?? "",
            unit: ingredient.unit ?? "",
          })),
        });
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setRecipe(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load this recipe. Please try again.",
        );
      });

    return () => controller.abort();
  }, [recipeId, requestNumber]);

  function retry() {
    setRecipe(null);
    setError(null);
    setRequestNumber((current) => current + 1);
  }

  if (error) {
    return (
      <div className="space-y-4" role="alert">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
            onClick={retry}
            type="button"
          >
            Try again
          </button>
          <Link
            className="rounded-lg px-3 py-2 text-sm font-bold text-[#35644f] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
            href="/recipes"
          >
            Back to recipe library
          </Link>
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <p className="text-sm font-semibold text-[#6f7a71]" role="status">
        Loading recipe...
      </p>
    );
  }

  return <RecipeForm initialValues={recipe} mode="edit" recipeId={recipeId} />;
}
