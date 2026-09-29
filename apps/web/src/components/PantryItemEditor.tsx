"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PantryItemForm, {
  type PantryItemFormValues,
} from "@/components/PantryItemForm";

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

export default function PantryItemEditor({
  pantryItemId,
}: {
  pantryItemId: string;
}) {
  const [item, setItem] = useState<PantryItemFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/pantry-items/${pantryItemId}`, {
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
  }, [pantryItemId, requestNumber]);

  function retry() {
    setItem(null);
    setError(null);
    setRequestNumber((current) => current + 1);
  }

  if (error) {
    return (
      <div className="space-y-4" role="alert">
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        <div className="flex flex-wrap gap-3">
          <button
            className="border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
            onClick={retry}
            type="button"
          >
            Try again
          </button>
          <Link
            className="px-3 py-2 text-sm font-medium text-zinc-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:text-zinc-300 dark:focus-visible:outline-zinc-100"
            href="/pantry"
          >
            Back to pantry
          </Link>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
        Loading pantry item...
      </p>
    );
  }

  return (
    <PantryItemForm
      initialValues={item}
      mode="edit"
      pantryItemId={pantryItemId}
    />
  );
}
