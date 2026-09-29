"use client";

import { useState, type SubmitEvent } from "react";

export type PantryItemFormValues = {
  name: string;
  quantity: string;
  unit: string;
};

type PantryItemFormProps =
  | { mode?: "create"; initialValues?: never; pantryItemId?: never }
  | {
      mode: "edit";
      initialValues: PantryItemFormValues;
      pantryItemId: string;
    };

type SubmissionStatus =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

function responseErrorMessage(payload: unknown, status: number) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  if (status === 409) {
    return "That ingredient is already in your pantry.";
  }

  return "Unable to save this pantry item. Please try again.";
}

export default function PantryItemForm(props: PantryItemFormProps) {
  const mode = props.mode ?? "create";
  const initialValues = mode === "edit" ? props.initialValues : undefined;
  const [name, setName] = useState(initialValues?.name ?? "");
  const [quantity, setQuantity] = useState(initialValues?.quantity ?? "");
  const [unit, setUnit] = useState(initialValues?.unit ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus>(null);

  function updateField(
    setter: (value: string) => void,
    value: string,
  ) {
    setStatus(null);
    setter(value);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const trimmedName = name.trim();
    const trimmedQuantity = quantity.trim();
    const trimmedUnit = unit.trim();

    if (!trimmedName) {
      setStatus({
        type: "error",
        message: "Enter an ingredient name before saving.",
      });
      return;
    }

    setIsSubmitting(true);

    const pantryItem = {
      name: trimmedName,
      ...(trimmedQuantity ? { quantity: trimmedQuantity } : {}),
      ...(trimmedUnit ? { unit: trimmedUnit } : {}),
    };

    try {
      const endpoint =
        mode === "edit"
          ? `/api/pantry-items/${props.pantryItemId}`
          : "/api/pantry-items";
      const response = await fetch(endpoint, {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pantryItem),
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        setStatus({
          type: "error",
          message: responseErrorMessage(payload, response.status),
        });
        return;
      }

      if (mode === "create") {
        setName("");
        setQuantity("");
        setUnit("");
        setStatus({
          type: "success",
          message: "Pantry item added successfully.",
        });
      } else {
        setStatus({
          type: "success",
          message: "Pantry item updated successfully.",
        });
      }
    } catch {
      setStatus({
        type: "error",
        message: "Unable to reach the server. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClasses =
    "mt-1 w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition-colors focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20 dark:disabled:bg-zinc-900";

  return (
    <form className="w-full space-y-6" onSubmit={handleSubmit}>
      <fieldset className="space-y-6" disabled={isSubmitting}>
        <legend className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          {mode === "edit" ? "Edit pantry item" : "Add pantry item"}
        </legend>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Track what is currently available in your pantry.
        </p>

        <div>
          <label
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
            htmlFor="pantry-item-name"
          >
            Ingredient name
          </label>
          <input
            autoComplete="off"
            className={inputClasses}
            id="pantry-item-name"
            name="name"
            onChange={(event) => updateField(setName, event.target.value)}
            required
            type="text"
            value={name}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
              htmlFor="pantry-item-quantity"
            >
              Quantity{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              className={inputClasses}
              id="pantry-item-quantity"
              name="quantity"
              onChange={(event) =>
                updateField(setQuantity, event.target.value)
              }
              placeholder="1/2, one bag, or to taste"
              type="text"
              value={quantity}
            />
          </div>

          <div>
            <label
              className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
              htmlFor="pantry-item-unit"
            >
              Unit <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              className={inputClasses}
              id="pantry-item-unit"
              name="unit"
              onChange={(event) => updateField(setUnit, event.target.value)}
              placeholder="bottle, cup, or can"
              type="text"
              value={unit}
            />
          </div>
        </div>

        <button
          className="h-11 bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 dark:focus-visible:outline-emerald-400"
          type="submit"
        >
          {isSubmitting
            ? mode === "edit"
              ? "Updating..."
              : "Adding..."
            : mode === "edit"
              ? "Update pantry item"
              : "Add to pantry"}
        </button>
      </fieldset>

      {status ? (
        <p
          className={
            status.type === "success"
              ? "text-sm font-medium text-green-700 dark:text-green-400"
              : "text-sm font-medium text-red-700 dark:text-red-400"
          }
          role={status.type === "error" ? "alert" : "status"}
        >
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
