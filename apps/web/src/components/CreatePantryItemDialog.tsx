"use client";

import { useRef, useState } from "react";

import PantryItemForm from "@/components/PantryItemForm";

type CreatePantryItemDialogProps = {
  onPantryItemCreated: () => void;
  triggerClassName?: string;
  triggerLabel?: string;
};

export default function CreatePantryItemDialog({
  onPantryItemCreated,
  triggerClassName,
  triggerLabel = "+ Add ingredient",
}: CreatePantryItemDialogProps) {
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
      dialogRef.current
        ?.querySelector<HTMLInputElement>("#pantry-item-name")
        ?.focus();
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
    if (generation !== generationRef.current || !dialogRef.current?.open) {
      return;
    }

    closeDialog();
    onPantryItemCreated();
  }

  return (
    <>
      <button
        className={
          triggerClassName ??
          "inline-flex min-h-11 items-center rounded-xl bg-[#35644f] px-5 text-[0.9rem] font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.16)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
        }
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        {triggerLabel}
      </button>

      <dialog
        aria-labelledby="create-pantry-item-dialog-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[#ded9cf] bg-[#fbfaf6] p-0 text-[#24342b] shadow-[0_24px_60px_rgba(42,48,38,0.18)] backdrop:bg-[#24342b]/35"
        onCancel={(event) => {
          if (submittingRef.current) {
            event.preventDefault();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !submittingRef.current) {
            closeDialog();
          }
        }}
        onClose={handleClose}
        ref={dialogRef}
      >
        {isOpen ? (
          <div className="p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-4 border-b border-[#e5e1d8] pb-4">
              <h2
                className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]"
                id="create-pantry-item-dialog-title"
              >
                Add ingredient
              </h2>
              <button
                aria-label="Close add ingredient dialog"
                className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                onClick={closeDialog}
                type="button"
              >
                Close
              </button>
            </div>

            <PantryItemForm
              hideIntro
              key={openGeneration}
              onSubmittingChange={(submitting) =>
                handleSubmittingChange(openGeneration, submitting)
              }
              onSuccess={() => handleCreated(openGeneration)}
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
