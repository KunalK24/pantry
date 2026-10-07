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
      className="m-auto max-h-[min(38rem,calc(100dvh-2rem))] w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#ded9cf] bg-[#fbfaf6] p-0 text-[#24342b] shadow-[0_24px_60px_rgba(42,48,38,0.18)] backdrop:bg-[#24342b]/35"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
      onClose={handleClose}
      ref={dialogRef}
    >
      <div className="flex max-h-[min(38rem,calc(100dvh-2rem))] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-[#e5e1d8] px-5 py-4">
          <div>
            <h2 className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]" id="meal-recipe-dialog-title">
              Add meal
            </h2>
            <p
              className="mt-1 text-sm leading-6 text-[#6f7a71]"
              id="meal-recipe-dialog-description"
            >
              Choose a recipe for {dayLabel}.
            </p>
          </div>
          <button
            aria-label="Close recipe picker"
            className="rounded-lg px-2 py-1 text-sm font-bold text-[#6f7a71] hover:bg-[#edf3ed] hover:text-[#35644f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
            onClick={closeDialog}
            ref={closeRef}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="min-h-28 flex-1 overflow-y-auto px-5 py-4">
          <ul className="divide-y divide-[#e5e1d8] border-y border-[#e5e1d8]">
            {recipes.map((recipe, index) => (
              <li
                className="flex items-start justify-between gap-4 py-4"
                key={recipe.id}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#24342b]">{recipe.name}</p>
                  {recipe.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-[#6f7a71]">
                      {recipe.description}
                    </p>
                  ) : null}
                </div>
                <button
                  className="shrink-0 rounded-xl border border-[#ded9cf] bg-[#fbfaf6] px-4 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
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
