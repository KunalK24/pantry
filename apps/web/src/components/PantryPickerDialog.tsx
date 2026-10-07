"use client";

import { useEffect, useRef, useState } from "react";

export type PantryPickerOption = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  updatedAt: string;
};

export type PantryPickerLoadState =
  | { status: "loading" }
  | { status: "ready"; items: PantryPickerOption[] }
  | { status: "error" };

type PantryLibraryResponse = { items: PantryPickerOption[] };

type PantryPickerDialogProps = {
  disabled?: boolean;
  selectedItems: PantryPickerOption[];
  onCommit: (items: PantryPickerOption[]) => void;
  onLoadStateChange: (state: PantryPickerLoadState) => void;
};

function isPantryItem(value: unknown): value is PantryPickerOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "quantity" in value &&
    (typeof value.quantity === "string" || value.quantity === null) &&
    "unit" in value &&
    (typeof value.unit === "string" || value.unit === null) &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string"
  );
}

function isPantryLibraryResponse(
  payload: unknown,
): payload is PantryLibraryResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "items" in payload &&
    Array.isArray(payload.items) &&
    payload.items.every(isPantryItem)
  );
}

function availableAmount(item: PantryPickerOption) {
  return [item.quantity, item.unit].filter(Boolean).join(" ");
}

export default function PantryPickerDialog({
  disabled = false,
  selectedItems,
  onCommit,
  onLoadStateChange,
}: PantryPickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<PantryPickerOption[] | null>(null);
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    onLoadStateChange({ status: "loading" });

    fetch("/api/pantry-items", { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isPantryLibraryResponse(payload)) {
          throw new Error("Unable to load your pantry.");
        }

        if (!active) return;

        setItems(payload.items);
        onLoadStateChange({ status: "ready", items: payload.items });
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        if (!active) return;

        setItems(null);
        setError("Unable to load your pantry. Please try again.");
        onLoadStateChange({ status: "error" });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [onLoadStateChange, requestNumber]);

  function openDialog() {
    setDraftIds(new Set(selectedItems.map((item) => item.id)));
    dialogRef.current?.showModal();
    requestAnimationFrame(() => {
      (firstOptionRef.current ?? closeRef.current)?.focus();
    });
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleClose() {
    setDraftIds(new Set(selectedItems.map((item) => item.id)));
    triggerRef.current?.focus();
  }

  function toggleItem(id: string) {
    setDraftIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function commitSelection() {
    onCommit((items ?? []).filter((item) => draftIds.has(item.id)));
    closeDialog();
  }

  function retry() {
    setItems(null);
    setError(null);
    onLoadStateChange({ status: "loading" });
    setRequestNumber((current) => current + 1);
  }

  return (
    <>
      <button
        className="min-h-10 rounded-xl border border-[#ded9cf] bg-[#fbfaf6] px-4 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50"
        data-pantry-picker-trigger
        disabled={disabled}
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        Add from pantry
      </button>

      <dialog
        aria-describedby="pantry-picker-description"
        aria-labelledby="pantry-picker-title"
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
              <h2 className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]" id="pantry-picker-title">
                Add from pantry
              </h2>
              <p
                className="mt-1 text-sm leading-6 text-[#6f7a71]"
                id="pantry-picker-description"
              >
                Select items that are running low and enter how much to buy.
              </p>
            </div>
            <button
              aria-label="Close pantry picker"
              className="rounded-lg px-2 py-1 text-sm font-bold text-[#6f7a71] hover:bg-[#edf3ed] hover:text-[#35644f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
              onClick={closeDialog}
              ref={closeRef}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="min-h-28 flex-1 overflow-y-auto px-5 py-4">
            {error ? (
              <div className="space-y-3" role="alert">
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
            ) : items === null ? (
              <p className="text-sm font-semibold text-[#6f7a71]" role="status">
                Loading pantry...
              </p>
            ) : items.length === 0 ? (
              <p className="text-sm font-semibold text-[#6f7a71]">
                Your pantry is empty.
              </p>
            ) : (
              <fieldset>
                <legend className="sr-only">Pantry items</legend>
                <ul className="divide-y divide-[#e5e1d8] border-y border-[#e5e1d8]">
                  {items.map((item, index) => {
                    const amount = availableAmount(item);

                    return (
                      <li key={item.id}>
                        <label className="flex cursor-pointer items-start gap-3 py-4 transition-colors hover:bg-[#f4f1e8]">
                          <input
                            checked={draftIds.has(item.id)}
                            className="mt-1 size-5 accent-[#35644f]"
                            onChange={() => toggleItem(item.id)}
                            ref={index === 0 ? firstOptionRef : undefined}
                            type="checkbox"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-[#24342b]">
                              {item.name}
                            </span>
                            <span className="mt-1 block text-sm text-[#6f7a71]">
                              {amount ? `${amount} available` : "Amount not specified"}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-[#e5e1d8] px-5 py-4">
            <button
              className="rounded-lg border border-[#ded9cf] bg-white px-4 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
              onClick={closeDialog}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-xl bg-[#35644f] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled || items === null || error !== null}
              onClick={commitSelection}
              type="button"
            >
              Add selected
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
