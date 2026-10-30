"use client";

import { useEffect, useRef, useState } from "react";

import PantryItemForm, {
  type PantryItemFormValues,
} from "@/components/PantryItemForm";

type EditPantryItemDialogProps = {
  itemId: string;
  itemName: string;
  onClose: () => void;
  onPantryItemUpdated: () => void;
};

type PantryItemResponse = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  createdAt: string;
  updatedAt: string;
};

function isPantryItemResponse(payload: unknown): payload is PantryItemResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    typeof payload.id === "string" &&
    "name" in payload &&
    typeof payload.name === "string" &&
    "quantity" in payload &&
    (typeof payload.quantity === "string" || payload.quantity === null) &&
    "unit" in payload &&
    (typeof payload.unit === "string" || payload.unit === null) &&
    "createdAt" in payload &&
    typeof payload.createdAt === "string" &&
    "updatedAt" in payload &&
    typeof payload.updatedAt === "string"
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
    ? "Pantry item not found."
    : "Unable to load this pantry item. Please try again.";
}

export default function EditPantryItemDialog({
  itemId,
  itemName,
  onClose,
  onPantryItemUpdated,
}: EditPantryItemDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const generationRef = useRef(0);
  const submittingRef = useRef(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const confirmationReturnFocusRef = useRef<HTMLElement | null>(null);
  const [item, setItem] = useState<PantryItemFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openGeneration, setOpenGeneration] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  useEffect(() => {
    if (isConfirmingDiscard) {
      keepEditingRef.current?.focus();
    }
  }, [isConfirmingDiscard]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    submittingRef.current = false;
    setIsSubmitting(false);
    setOpenGeneration(generation);
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    requestAnimationFrame(() => {
      dialog.querySelector<HTMLInputElement>("#pantry-item-name")?.focus();
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/pantry-items/${itemId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(responseErrorMessage(payload, response.status));
        }

        if (!isPantryItemResponse(payload)) {
          throw new Error("Unable to load this pantry item. Please try again.");
        }

        setItem({
          name: payload.name,
          quantity: payload.quantity ?? "",
          unit: payload.unit ?? "",
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

        setItem(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load this pantry item. Please try again.",
        );
      });

    return () => controller.abort();
  }, [itemId, requestNumber]);

  function closeDialog(force = false) {
    if (submittingRef.current) {
      return;
    }
    if (isDirty && !force) {
      if (!isConfirmingDiscard) {
        confirmationReturnFocusRef.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      }
      setIsConfirmingDiscard(true);
      return;
    }
    dialogRef.current?.close();
  }

  function keepEditing() {
    setIsConfirmingDiscard(false);
    requestAnimationFrame(() => confirmationReturnFocusRef.current?.focus());
  }

  function handleSubmittingChange(generation: number, submitting: boolean) {
    if (generation !== generationRef.current) {
      return;
    }

    submittingRef.current = submitting;
    setIsSubmitting(submitting);
  }

  function handleUpdated(generation: number) {
    if (generation !== generationRef.current || !dialogRef.current?.open) {
      return;
    }

    closeDialog(true);
    onPantryItemUpdated();
  }

  function retry() {
    setItem(null);
    setError(null);
    setRequestNumber((current) => current + 1);
  }

  function handleClose() {
    onClose();
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  return (
    <dialog
      aria-labelledby="edit-pantry-item-dialog-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[#ded9cf] bg-[#fbfaf6] p-0 text-[#24342b] shadow-[0_24px_60px_rgba(42,48,38,0.18)] backdrop:bg-[#24342b]/35"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onChangeCapture={() => setIsDirty(true)}
      onInputCapture={() => setIsDirty(true)}
      onClose={handleClose}
      ref={dialogRef}
    >
      <div className="p-5 sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-[#e5e1d8] pb-4">
          <div>
            <h2
              className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]"
              id="edit-pantry-item-dialog-title"
            >
              Edit ingredient
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#6f7a71]">
              Update {itemName} in your pantry.
            </p>
          </div>
          <button
            aria-label="Close edit ingredient dialog"
            className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => closeDialog()}
            type="button"
          >
            Close
          </button>
        </div>

        {error ? (
          <div className="space-y-4" role="alert">
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </p>
            <button
              className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
              onClick={retry}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : item ? (
          <PantryItemForm
            hideIntro
            initialValues={item}
            key={openGeneration}
            mode="edit"
            onSubmittingChange={(submitting) =>
              handleSubmittingChange(openGeneration, submitting)
            }
            onSuccess={() => handleUpdated(openGeneration)}
            pantryItemId={itemId}
          />
        ) : (
          <p className="text-sm font-semibold text-[#6f7a71]" role="status">
            Loading pantry item...
          </p>
        )}
        {isConfirmingDiscard ? (
          <div aria-live="polite" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4" role="group">
            <p className="text-sm font-semibold text-[#24342b]">Discard your ingredient changes?</p>
            <div className="mt-3 flex gap-3">
              <button className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f]" onClick={keepEditing} ref={keepEditingRef} type="button">Keep editing</button>
              <button className="rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white" onClick={() => closeDialog(true)} type="button">Discard changes</button>
            </div>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
