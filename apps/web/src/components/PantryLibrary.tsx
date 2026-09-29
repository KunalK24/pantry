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
    <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {items.map((item) => {
        const amount = pantryAmount(item);

        return (
          <li key={item.id}>
            <Link
              className="grid gap-2 px-1 py-5 transition-colors hover:bg-emerald-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:hover:bg-emerald-950/20 dark:focus-visible:outline-emerald-400 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3"
              href={`/pantry/${item.id}/edit`}
            >
              <div className="min-w-0">
                <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {item.name}
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {amount || "Amount not specified"}
                </p>
              </div>
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-400">
                Edit item
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
