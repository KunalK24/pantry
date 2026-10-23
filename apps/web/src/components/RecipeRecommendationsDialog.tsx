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
        className="min-h-10 rounded-xl border border-[#ded9cf] bg-[#fbfaf6] px-4 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        Recommend recipes
      </button>

      <dialog
        aria-describedby="recipe-recommendations-description"
        aria-labelledby="recipe-recommendations-title"
        className="m-auto max-h-[min(42rem,calc(100dvh-2rem))] w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#ded9cf] bg-[#fbfaf6] p-0 text-[#24342b] shadow-[0_24px_60px_rgba(42,48,38,0.18)] backdrop:bg-[#24342b]/35"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeDialog();
          }
        }}
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <div className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-[#e5e1d8] px-5 py-4">
            <div>
              <h2
                className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]"
                id="recipe-recommendations-title"
              >
                Recommended recipes
              </h2>
              <p
                className="mt-1 text-sm leading-6 text-[#6f7a71]"
                id="recipe-recommendations-description"
              >
                Recipes that need the fewest new ingredients appear first.
              </p>
            </div>
            <button
              aria-label="Close recipe recommendations"
              className="rounded-lg px-2 py-1 text-sm font-bold text-[#6f7a71] hover:bg-[#edf3ed] hover:text-[#35644f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
              onClick={closeDialog}
              ref={closeRef}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="min-h-28 flex-1 overflow-y-auto px-5 py-4">
            {recommendations.length === 0 ? (
              <p className="text-sm font-semibold text-[#6f7a71]">
                {emptyMessage}
              </p>
            ) : (
              <ul className="divide-y divide-[#e5e1d8] border-y border-[#e5e1d8]">
                {recommendations.map((recommendation, index) => {
                  const pantryCount = recommendation.pantryCoveredNames.length;
                  const groceryCount =
                    recommendation.groceryOverlapNames.length;
                  const covered = pantryCount + groceryCount;

                  return (
                    <li className="py-5" key={recommendation.recipe.id}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="[font-family:Georgia,serif] text-xl font-bold text-[#24342b]">
                            {recommendation.recipe.name}
                          </h3>
                          <p className="mt-1 text-sm font-bold text-[#35644f]">
                            {covered}/{recommendation.total} ingredients ready
                          </p>
                          <p className="mt-1 text-xs font-semibold text-[#6f7a71]">
                            {pantryCount} in pantry / {groceryCount} already on
                            list / {recommendation.missingNames.length} still
                            needed
                          </p>
                          {pantryCount ? (
                            <p className="mt-2 text-xs text-[#6f7a71]">
                              <span className="font-bold text-[#334238]">
                                In pantry:
                              </span>{" "}
                              {recommendation.pantryCoveredNames.join(", ")}
                            </p>
                          ) : null}
                          {groceryCount ? (
                            <p className="mt-1 text-xs text-[#6f7a71]">
                              <span className="font-bold text-[#334238]">
                                On list:
                              </span>{" "}
                              {recommendation.groceryOverlapNames.join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <button
                          className="h-10 shrink-0 rounded-xl bg-[#35644f] px-4 text-sm font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.12)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
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
