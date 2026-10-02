"use client";

import { useEffect, useRef } from "react";

export type MealPlannerRecipe = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  ingredients: Array<{
    name: string;
    quantity: string | null;
    unit: string | null;
  }>;
};

type MealRecipeDialogProps = {
  dayLabel: string;
  open: boolean;
  recipes: MealPlannerRecipe[];
  onAdd: (recipeId: string) => void;
  onClose: () => void;
};

export default function MealRecipeDialog({
  dayLabel,
  open,
  recipes,
  onAdd,
  onClose,
}: MealRecipeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstAddRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      requestAnimationFrame(() => {
        (firstAddRef.current ?? closeRef.current)?.focus();
      });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleClose() {
    onClose();
    returnFocusRef.current?.focus();
  }

  return (
    <dialog
      aria-describedby="meal-recipe-dialog-description"
      aria-labelledby="meal-recipe-dialog-title"
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
            <h2 className="text-lg font-semibold" id="meal-recipe-dialog-title">
              Add meal
            </h2>
            <p
              className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
              id="meal-recipe-dialog-description"
            >
              Choose a recipe for {dayLabel}.
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
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {recipes.map((recipe, index) => (
              <li
                className="flex items-start justify-between gap-4 py-3"
                key={recipe.id}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{recipe.name}</p>
                  {recipe.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {recipe.description}
                    </p>
                  ) : null}
                </div>
                <button
                  className="shrink-0 border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:border-zinc-700 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
                  onClick={() => onAdd(recipe.id)}
                  ref={index === 0 ? firstAddRef : undefined}
                  type="button"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </dialog>
  );
}
