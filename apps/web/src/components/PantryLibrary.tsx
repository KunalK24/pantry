"use client";

import { useEffect, useState } from "react";

import CreatePantryItemDialog from "@/components/CreatePantryItemDialog";
import EditPantryItemDialog from "@/components/EditPantryItemDialog";

type PantryItemSummary = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  updatedAt: string;
};

type PantryLibraryResponse = { items: PantryItemSummary[] };

function isPantryItemSummary(value: unknown): value is PantryItemSummary {
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
    payload.items.every(isPantryItemSummary)
  );
}

function pantryAmount(item: PantryItemSummary) {
  return [item.quantity, item.unit].filter(Boolean).join(" ");
}

type PantryLibraryProps = {
  onPantryItemCreated?: () => void;
  refreshSignal?: number;
};

export default function PantryLibrary({
  onPantryItemCreated,
  refreshSignal = 0,
}: PantryLibraryProps) {
  const [items, setItems] = useState<PantryItemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<PantryItemSummary | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadPantryItems() {
      try {
        const response = await fetch("/api/pantry-items", {
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isPantryLibraryResponse(payload)) {
          throw new Error("Unable to load your pantry.");
        }

        setItems(payload.items);
        setError(null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setItems(null);
        setError("Unable to load your pantry. Please try again.");
      }
    }

    void loadPantryItems();

    return () => controller.abort();
  }, [requestNumber, refreshSignal]);

  function retry() {
    setItems(null);
    setError(null);
    setRequestNumber((current) => current + 1);
  }

  async function handleDeletePantryItem(item: PantryItemSummary) {
    if (deletingId !== null) {
      return;
    }

    const confirmed = window.confirm(`Delete ${item.name} from your pantry?`);
    if (!confirmed) {
      return;
    }

    setDeletingId(item.id);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/pantry-items/${item.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);

        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to delete the pantry item.";

        throw new Error(message);
      }

      setItems(
        (current) =>
          current?.filter((currentItem) => currentItem.id !== item.id) ?? null,
      );
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Unable to delete the pantry item.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (error) {
    return (
      <div className="space-y-4 border-y border-red-200 py-5" role="alert">
        <p className="text-sm font-semibold text-red-800">{error}</p>
        <button
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-800 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
          onClick={retry}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (items === null) {
    return (
      <p
        className="border-y border-[#e5e1d8] py-6 text-sm font-semibold text-[#69736b]"
        role="status"
      >
        Loading pantry...
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4 border-y border-dashed border-[#d8d3c8] py-8 text-center">
        <h2 className="[font-family:Georgia,serif] text-xl font-bold text-[#24342b]">
          Your pantry is ready.
        </h2>
        <p className="mx-auto max-w-md text-sm leading-6 text-[#6f7a71]">
          Your pantry is empty. Add an ingredient you have on hand.
        </p>
        <CreatePantryItemDialog
          onPantryItemCreated={() => {
            retry();
            onPantryItemCreated?.();
          }}
        />
      </div>
    );
  }

  return (
    <>
      {deleteError ? (
        <p
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
          role="alert"
        >
          {deleteError}
        </p>
      ) : null}
      <ul className="divide-y divide-[#ebe7dd] border-y border-[#e5e1d8]">
        {items.map((item) => {
          const amount = pantryAmount(item);

          return (
            <li key={item.id}>
              <div className="grid gap-4 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold uppercase tracking-[0.14em] text-[#c5745a]">
                      Ingredient
                    </span>
                    {amount ? (
                      <>
                        <span aria-hidden="true" className="text-[#d6d0c4]">
                          •
                        </span>
                        <span className="font-semibold text-[#78837b]">
                          {amount}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <h2 className="[font-family:Georgia,serif] text-[1.5rem] font-bold leading-tight text-[#24342b] md:text-[1.8rem]">
                    <button
                      className="rounded-md text-left transition-colors hover:text-[#35644f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#35644f]"
                      onClick={() => setEditingItem(item)}
                      type="button"
                    >
                      {item.name}
                    </button>
                  </h2>
                  {!amount ? (
                    <p className="mt-2 text-sm leading-6 text-[#7b857d]">
                      Amount not specified
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <button
                    className="rounded-lg px-3 py-2 text-xs font-bold text-[#35644f] transition-colors hover:bg-[#e8f1e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
                    onClick={() => setEditingItem(item)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Delete ${item.name}`}
                    className="rounded-lg px-3 py-2 text-xs font-bold text-[#9b4f40] transition-colors hover:bg-[#f6e8e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={deletingId === item.id}
                    onClick={() => void handleDeletePantryItem(item)}
                    type="button"
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {editingItem ? (
        <EditPantryItemDialog
          itemId={editingItem.id}
          itemName={editingItem.name}
          onClose={() => setEditingItem(null)}
          onPantryItemUpdated={() => {
            retry();
            onPantryItemCreated?.();
          }}
        />
      ) : null}
    </>
  );
}
