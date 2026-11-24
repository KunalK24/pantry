"use client";

import { useEffect, useMemo, useState } from "react";

import ActionIcon from "@/components/ActionIcon";
import CreatePantryItemDialog from "@/components/CreatePantryItemDialog";
import EditPantryItemDialog from "@/components/EditPantryItemDialog";
import { PANTRY_LOCATIONS } from "@/components/PantryItemForm";

type PantryItemSummary = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  brand?: string | null;
  packageQuantity?: string | null;
  packageUnit?: string | null;
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
    (!("brand" in value) || typeof value.brand === "string" || value.brand === null) &&
    (!("packageQuantity" in value) || typeof value.packageQuantity === "string" || value.packageQuantity === null) &&
    (!("packageUnit" in value) || typeof value.packageUnit === "string" || value.packageUnit === null) &&
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
  const amount = [item.quantity, item.unit].filter(Boolean).join(" ");
  const packageSize = item.packageQuantity && item.packageUnit
    ? `${item.packageQuantity} ${item.packageUnit} each`
    : "";
  return [amount, packageSize].filter(Boolean).join(" · ");
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
  const [selectedExpiration, setSelectedExpiration] = useState<
    "expired" | "expiringSoon" | null
  >(null);
  const today = new Date();
  const todayKey = localDateKey(today);
  const expiringSoonEndKey = localDateKey(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3),
  );
  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return items?.filter((item) => {
      if (!item.name.toLocaleLowerCase().includes(query) &&
        !item.brand?.toLocaleLowerCase().includes(query)) {
        return false;
      }
      if (selectedLocation && item.location !== selectedLocation) {
        return false;
      }
      if (selectedExpiration === "expired") {
        return item.expiresOn !== null && item.expiresOn < todayKey;
      }
      if (selectedExpiration === "expiringSoon") {
        return item.expiresOn !== null &&
          item.expiresOn >= todayKey &&
          item.expiresOn <= expiringSoonEndKey;
      }
      return true;
    }) ?? [];
  }, [items, searchQuery, selectedLocation, selectedExpiration, todayKey, expiringSoonEndKey]);
  const locationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items ?? []) {
      if (item.location) {
        counts.set(item.location, (counts.get(item.location) ?? 0) + 1);
      }
    }
    return counts;
  }, [items]);
  const expirationCounts = useMemo(() => {
    return {
      expired: items?.filter((item) => item.expiresOn && item.expiresOn < todayKey).length ?? 0,
      expiringSoon: items?.filter((item) =>
        item.expiresOn && item.expiresOn >= todayKey && item.expiresOn <= expiringSoonEndKey,
      ).length ?? 0,
    };
  }, [items, todayKey, expiringSoonEndKey]);

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

  return (
    <>
      <div className="grid gap-7 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <aside aria-label="Pantry filters" className="rounded-[1.5rem] border border-[#e2e4da] bg-white p-4 shadow-[0_12px_32px_rgba(36,52,43,0.04)] lg:sticky lg:top-6">
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-[#69766c]" htmlFor="pantry-search">
            Search pantry
          </label>
          <input
            className="mt-3 h-11 w-full rounded-lg border border-[#d8d3c8] bg-white px-3 text-sm font-semibold text-[#24342b] outline-none placeholder:text-[#a0a69e] focus:border-[#35644f]"
            id="pantry-search"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Find an ingredient"
            type="search"
            value={searchQuery}
          />

          <div className="mt-6 border-t border-[#e8e9e1] pt-5" role="group" aria-label="Filter by location">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#69766c]">Locations</h2>
            <div className="mt-3 space-y-1">
              {["", ...PANTRY_LOCATIONS].map((pantryLocation) => (
                <button
                  aria-pressed={selectedLocation === pantryLocation}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] ${selectedLocation === pantryLocation ? "bg-[#e8f0e8] font-bold text-[#294e3e]" : "text-[#526258] hover:bg-[#f5f6f1]"}`}
                  key={pantryLocation}
                  onClick={() => setSelectedLocation(pantryLocation)}
                  type="button"
                >
                  <span className="min-w-0">{pantryLocation || "All items"}</span>
                  <span className="shrink-0 text-xs text-[#7f8d81]">
                    {pantryLocation ? locationCounts.get(pantryLocation) ?? 0 : items.length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <section aria-labelledby="pantry-expiration-heading" className="mt-6 border-t border-[#e8e9e1] pt-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#69766c]" id="pantry-expiration-heading">
              Expiration
            </h2>
            <button
              aria-pressed={selectedExpiration === "expired"}
              className={`mt-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#9b4f40] transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] ${selectedExpiration === "expired" ? "bg-red-50" : ""}`}
              onClick={() => setSelectedExpiration((current) => current === "expired" ? null : "expired")}
              type="button"
            >
              <span>Expired</span>
              <span>{expirationCounts.expired}</span>
            </button>
            <button
              aria-pressed={selectedExpiration === "expiringSoon"}
              className={`mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#71502b] transition-colors hover:bg-[#fff7e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#71502b] ${selectedExpiration === "expiringSoon" ? "bg-[#fff7e9]" : ""}`}
              onClick={() => setSelectedExpiration((current) => current === "expiringSoon" ? null : "expiringSoon")}
              type="button"
            >
              <span>Expiring in 3 days</span>
              <span>{expirationCounts.expiringSoon}</span>
            </button>
          </section>
        </aside>
        <div className="min-w-0">
          {deleteError ? (
            <p
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
              role="alert"
            >
              {deleteError}
            </p>
          ) : null}
          {items.length === 0 ? (
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
          ) : visibleItems.length === 0 ? (
            <div className="border-y border-dashed border-[#d8d3c8] py-8 text-center">
              <p className="text-sm text-[#6f7a71]">No pantry items match these filters.</p>
              <button className="mt-3 rounded-lg px-3 py-2 text-sm font-bold text-[#35644f] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]" onClick={() => { setSearchQuery(""); setSelectedLocation(""); setSelectedExpiration(null); }} type="button">Clear filters</button>
            </div>
          ) : (
            <ul className="space-y-3">
              {visibleItems.map((item) => {
                const amount = pantryAmount(item);
                const isExpired = item.expiresOn !== null && item.expiresOn < todayKey;
                const isExpiringSoon = item.expiresOn !== null &&
                  item.expiresOn >= todayKey &&
                  item.expiresOn <= expiringSoonEndKey;

                return (
                  <li className="min-w-0 overflow-hidden rounded-2xl border border-[#e5e1d8] bg-white shadow-[0_4px_16px_rgba(36,52,43,0.03)]" key={item.id}>
                    <div className="flex items-center justify-between gap-3 px-5 py-2">
                      <h2 className="min-w-0 [font-family:Georgia,serif] text-[1.5rem] font-bold leading-tight text-[#24342b]">
                        <button
                          className="block max-w-full rounded-md text-left [overflow-wrap:anywhere] transition-colors hover:text-[#35644f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#35644f]"
                          onClick={() => setEditingItem(item)}
                          type="button"
                        >
                          {item.name}
                        </button>
                      </h2>
                      <div className="flex shrink-0 gap-1" role="group" aria-label={`Actions for ${item.name}`}>
                        <button
                          aria-label={`Edit ${item.name}`}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#35644f] transition-colors hover:bg-[#e8f1e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
                          onClick={() => setEditingItem(item)}
                          title="Edit"
                          type="button"
                        >
                          <ActionIcon action="edit" className="h-5 w-5" />
                        </button>
                        <button
                          aria-label={deletingId === item.id ? `Deleting ${item.name}` : `Delete ${item.name}`}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#9b4f40] transition-colors hover:bg-[#f6e8e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b4f40] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={deletingId === item.id}
                          onClick={() => void handleDeletePantryItem(item)}
                          title="Delete"
                          type="button"
                        >
                          {deletingId === item.id ? (
                            <span aria-hidden="true" className="text-lg leading-none">…</span>
                          ) : (
                            <ActionIcon action="delete" className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#ebe9e1] bg-[#fbfaf6] px-5 py-4 sm:grid-cols-3">
                      <div className="min-w-0">
                        <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[#7b857d]">Quantity</dt>
                        <dd className="mt-1 break-words text-[0.9375rem] font-semibold text-[#35483b]">{amount || "Not set"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[#7b857d]">Location</dt>
                        <dd className="mt-1 break-words text-[0.9375rem] font-semibold text-[#35483b]">{item.location || "Not set"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className={`text-xs font-bold uppercase tracking-[0.12em] ${isExpired ? "text-[#9b4f40]" : isExpiringSoon ? "text-[#946326]" : "text-[#7b857d]"}`}>
                          {isExpired ? "Expired" : isExpiringSoon ? "Expiring soon" : "Expires"}
                        </dt>
                        <dd className={`mt-1 break-words text-[0.9375rem] font-semibold ${isExpired ? "text-[#9b4f40]" : isExpiringSoon ? "text-[#946326]" : "text-[#35483b]"}`}>
                          {item.expiresOn ? expirationLabel(item.expiresOn) : "Not set"}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
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
