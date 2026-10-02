"use client";

import { useEffect, useRef } from "react";

import type { RecipeRecommendation } from "@/lib/grocery-list";

type RecipeRecommendationsDialogProps = {
  disabled: boolean;
  emptyMessage: string;
  onAddRecipe: (recipeId: string) => void;
  recommendations: RecipeRecommendation[];
};

export default function RecipeRecommendationsDialog({
  disabled,
  emptyMessage,
  onAddRecipe,
  recommendations,
}: RecipeRecommendationsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const firstAddRef = useRef<HTMLButtonElement>(null);
  const addedRecipeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const addedRecipeId = addedRecipeIdRef.current;

    if (
      addedRecipeId === null ||
      recommendations.some(
        (recommendation) => recommendation.recipe.id === addedRecipeId,
      )
    ) {
      return;
    }

    addedRecipeIdRef.current = null;
    const frame = requestAnimationFrame(() => {
      (firstAddRef.current ?? closeRef.current)?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [recommendations]);

  function openDialog() {
    dialogRef.current?.showModal();
    requestAnimationFrame(() => {
      (firstAddRef.current ?? closeRef.current)?.focus();
    });
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function addRecipe(recipeId: string) {
    addedRecipeIdRef.current = recipeId;
    onAddRecipe(recipeId);
  }

  return (
    <>
      <button
        className="h-10 border border-sky-700 px-4 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-sky-950/30 dark:focus-visible:outline-sky-400"
        disabled={disabled}
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        Recommend Recipes
      </button>

      <dialog
        aria-describedby="recipe-recommendations-description"
        aria-labelledby="recipe-recommendations-title"
        className="m-auto max-h-[min(42rem,calc(100dvh-2rem))] w-[min(40rem,calc(100vw-2rem))] border border-zinc-300 bg-white p-0 text-zinc-950 shadow-xl backdrop:bg-black/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <div className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <div>
              <h2
                className="text-lg font-semibold"
                id="recipe-recommendations-title"
              >
                Recommended Recipes
              </h2>
              <p
                className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
                id="recipe-recommendations-description"
              >
                Recipes that need the fewest new ingredients appear first.
              </p>
            </div>
            <button
              aria-label="Close recipe recommendations"
              className="px-2 py-1 text-sm font-medium text-zinc-600 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:text-zinc-400 dark:hover:text-white dark:focus-visible:outline-zinc-100"
              onClick={closeDialog}
              ref={closeRef}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="min-h-28 flex-1 overflow-y-auto px-5 py-4">
            {recommendations.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {emptyMessage}
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {recommendations.map((recommendation, index) => {
                  const pantryCount =
                    recommendation.pantryCoveredNames.length;
                  const groceryCount =
                    recommendation.groceryOverlapNames.length;
                  const covered = pantryCount + groceryCount;

                  return (
                    <li className="py-5" key={recommendation.recipe.id}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold">
                            {recommendation.recipe.name}
                          </h3>
                          <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                            {covered}/{recommendation.total} ingredients ready
                          </p>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {pantryCount} in pantry / {groceryCount} already on
                            list /{" "}
                            {recommendation.missingNames.length} still needed
                          </p>
                          {pantryCount ? (
                            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                In pantry:
                              </span>{" "}
                              {recommendation.pantryCoveredNames.join(", ")}
                            </p>
                          ) : null}
                          {groceryCount ? (
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                On list:
                              </span>{" "}
                              {recommendation.groceryOverlapNames.join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <button
                          className="h-10 shrink-0 bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white dark:focus-visible:outline-zinc-100"
                          onClick={() => addRecipe(recommendation.recipe.id)}
                          ref={index === 0 ? firstAddRef : undefined}
                          type="button"
                        >
                          Add recipe
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
