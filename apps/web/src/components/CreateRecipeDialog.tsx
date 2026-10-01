"use client";

import { useRef, useState } from "react";

import RecipeForm from "@/components/RecipeForm";

type CreateRecipeDialogProps = {
  onRecipeCreated: () => void;
};

export default function CreateRecipeDialog({
  onRecipeCreated,
}: CreateRecipeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const generationRef = useRef(0);
  const submittingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openGeneration, setOpenGeneration] = useState(0);

  function openDialog() {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    submittingRef.current = false;
    setIsSubmitting(false);
    setOpenGeneration(generation);
    setIsOpen(true);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLInputElement>("#recipe-name")?.focus();
    });
  }

  function closeDialog() {
    if (submittingRef.current) {
      return;
    }

    dialogRef.current?.close();
  }

  function handleClose() {
    generationRef.current += 1;
    submittingRef.current = false;
    setIsSubmitting(false);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleSubmittingChange(generation: number, submitting: boolean) {
    if (generation !== generationRef.current) {
      return;
    }

    submittingRef.current = submitting;
    setIsSubmitting(submitting);
  }

  function handleCreated(generation: number) {
    if (
      generation !== generationRef.current ||
      !dialogRef.current?.open
    ) {
      return;
    }

    closeDialog();
    onRecipeCreated();
  }

  return (
    <>
      <button
        className="bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white dark:focus-visible:outline-zinc-100"
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        Create recipe
      </button>

      <dialog
        aria-labelledby="create-recipe-dialog-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto border border-zinc-300 bg-white p-0 text-zinc-950 backdrop:bg-black/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        onClick={(event) => {
          if (
            event.target === event.currentTarget &&
            !submittingRef.current
          ) {
            closeDialog();
          }
        }}
        onClose={handleClose}
        onCancel={(event) => {
          if (submittingRef.current) {
            event.preventDefault();
          }
        }}
        ref={dialogRef}
      >
        {isOpen ? (
          <div className="p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
              <h2
                className="text-lg font-semibold"
                id="create-recipe-dialog-title"
              >
                Create recipe
              </h2>
              <button
                aria-label="Close create recipe dialog"
                className="border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                disabled={isSubmitting}
                onClick={closeDialog}
                type="button"
              >
                Close
              </button>
            </div>

            <RecipeForm
              key={openGeneration}
              onSubmittingChange={(submitting) =>
                handleSubmittingChange(openGeneration, submitting)
              }
              onSuccess={() => handleCreated(openGeneration)}
            />

            <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <button
                className="border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                disabled={isSubmitting}
                onClick={closeDialog}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
