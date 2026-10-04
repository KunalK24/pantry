"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

export default function PantryLibrary() {
  const [items, setItems] = useState<PantryItemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/pantry-items", { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isPantryLibraryResponse(payload)) {
          throw new Error("Unable to load your pantry.");
        }

        setItems(payload.items);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setItems(null);
        setError("Unable to load your pantry. Please try again.");
      });

    return () => controller.abort();
  }, [requestNumber]);

  function retry() {
    setItems(null);
    setError(null);
    setRequestNumber((current) => current + 1);
  }

  async function handleDeletePantryItem(item: PantryItemSummary) {
    if (deletingId !== null) return

    const confirmed = window.confirm(`Delete ${item.name} from your pantry?`)
    if (!confirmed) return

    setDeletingId(item.id)
    setDeleteError(null)

    try {
      const response = await fetch(`/api/pantry-items/${item.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)

        const message =
          typeof payload === 'object' &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to delete the pantry item."

        throw new Error(message)
      }

      setItems((current) =>
        current?.filter((currentItem) => currentItem.id !== item.id) ?? null,
      )
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Unable to delete the pantry item."
      )
    } finally {
      setDeletingId(null)
    }
  }

  if (error) {
    return (
      <div className="space-y-4" role="alert">
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        <button
          className="border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
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
      <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
        Loading pantry...
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-zinc-600 dark:text-zinc-400">
          Your pantry is empty. Add an ingredient you have on hand.
        </p>
        <Link
          className="inline-block bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 dark:focus-visible:outline-emerald-400"
          href="/pantry/new"
        >
          Add pantry item
        </Link>
      </div>
    );
  }

  return (
    <>
      {deleteError ? (
        <p className="mb-4 text-sm text-red-700 dark:text-red-400" role="alert">
          {deleteError}
        </p>
      ) : null}
      <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {items.map((item) => {
          const amount = pantryAmount(item);

          return (
            <li key={item.id}>
              <div className="grid gap-2 px-1 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">
                    {item.name}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {amount || "Amount not specified"}
                  </p>
                </div>
                <div className="flex flex-nowrap items-center gap-2">
                  <button
                    aria-label={`Delete ${item.name}`}
                    className="px-2 py-1 text-sm font-medium text-red-700"
                    disabled={deletingId === item.id}
                    onClick={() => void handleDeletePantryItem(item)}
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </button>
                  <Link
                    className="-mx-2 w-fit px-2 py-1 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-50 hover:text-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300 dark:focus-visible:outline-emerald-400"
                    href={`/pantry/${item.id}/edit`}
                  >
                    Edit item
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
