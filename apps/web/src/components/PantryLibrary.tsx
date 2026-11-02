"use client";

import { useEffect, useMemo, useState } from "react";

import CreatePantryItemDialog from "@/components/CreatePantryItemDialog";
import EditPantryItemDialog from "@/components/EditPantryItemDialog";
import { PANTRY_LOCATIONS } from "@/components/PantryItemForm";

type PantryItemSummary = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  location: string | null;
  expiresOn: string | null;
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
    "location" in value &&
    (typeof value.location === "string" || value.location === null) &&
    "expiresOn" in value &&
    (typeof value.expiresOn === "string" || value.expiresOn === null) &&
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

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function expirationLabel(expiresOn: string) {
  const [year, month, day] = expiresOn.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return items?.filter((item) =>
      item.name.toLocaleLowerCase().includes(query) &&
      (!selectedLocation || item.location === selectedLocation),
    ) ?? [];
  }, [items, searchQuery, selectedLocation]);
  const expirationCounts = useMemo(() => {
    const today = new Date();
    const start = localDateKey(today);
    const end = localDateKey(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3),
    );
    return {
      expired: items?.filter((item) => item.expiresOn && item.expiresOn < start).length ?? 0,
      expiringSoon: items?.filter((item) =>
        item.expiresOn && item.expiresOn >= start && item.expiresOn <= end,
      ).length ?? 0,
    };
  }, [items]);

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
      {expirationCounts.expired > 0 || expirationCounts.expiringSoon > 0 ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2" role="status">
          {expirationCounts.expired > 0 ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {expirationCounts.expired} {expirationCounts.expired === 1 ? "ingredient has" : "ingredients have"} expired.
            </p>
          ) : null}
          {expirationCounts.expiringSoon > 0 ? (
            <p className="rounded-xl border border-[#ead8bd] bg-[#fff7e9] px-4 py-3 text-sm font-semibold text-[#71502b]">
              {expirationCounts.expiringSoon} {expirationCounts.expiringSoon === 1 ? "ingredient is" : "ingredients are"} expiring in the next 3 days.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by location">
          {["", ...PANTRY_LOCATIONS].map((pantryLocation) => (
            <button
              aria-pressed={selectedLocation === pantryLocation}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] ${selectedLocation === pantryLocation ? "bg-[#e8f1e9] text-[#244d39]" : "text-[#68736b] hover:bg-[#f1f0e9]"}`}
              key={pantryLocation}
              onClick={() => setSelectedLocation(pantryLocation)}
              type="button"
            >
              {pantryLocation || "All"}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="pantry-search">Search your pantry</label>
        <input
          className="h-11 w-full max-w-sm border-0 border-b border-[#d8d3c8] bg-transparent px-1 text-sm font-semibold text-[#24342b] outline-none placeholder:text-[#a0a69e] focus:border-[#35644f]"
          id="pantry-search"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search your pantry"
          type="search"
          value={searchQuery}
        />
      </div>
      {deleteError ? (
        <p
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
          role="alert"
        >
          {deleteError}
        </p>
      ) : null}
      {visibleItems.length === 0 ? (
        <div className="border-y border-dashed border-[#d8d3c8] py-8 text-center">
          <p className="text-sm text-[#6f7a71]">No pantry items match these filters.</p>
          <button className="mt-3 rounded-lg px-3 py-2 text-sm font-bold text-[#35644f] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]" onClick={() => { setSearchQuery(""); setSelectedLocation(""); }} type="button">Clear filters</button>
        </div>
      ) : (
      <ul className="divide-y divide-[#ebe7dd] border-y border-[#e5e1d8]">
        {visibleItems.map((item) => {
          const amount = pantryAmount(item);

          return (
            <li key={item.id}>
              <div className="grid gap-4 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <h2 className="[font-family:Georgia,serif] text-[1.5rem] font-bold leading-tight text-[#24342b] md:text-[1.8rem]">
                    <button
                      className="rounded-md text-left transition-colors hover:text-[#35644f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#35644f]"
                      onClick={() => setEditingItem(item)}
                      type="button"
                    >
                      {item.name}
                    </button>
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#7b857d]">
                    {amount ? `Quantity: ${amount}` : "Quantity not specified"}
                  </p>
                  {item.location || item.expiresOn ? (
                    <p className="mt-1 text-sm leading-6 text-[#7b857d]">
                      {[item.location, item.expiresOn ? `Expires ${expirationLabel(item.expiresOn)}` : null].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <button
                    className="min-h-11 rounded-lg px-4 py-2.5 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#e8f1e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
                    onClick={() => setEditingItem(item)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Delete ${item.name}`}
                    className="min-h-11 rounded-lg px-4 py-2.5 text-sm font-bold text-[#9b4f40] transition-colors hover:bg-[#f6e8e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:cursor-not-allowed disabled:opacity-60"
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
      )}
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
