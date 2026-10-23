"use client";

import { useRouter } from "next/navigation";
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

type PantryItemFormCallbacks = {
  hideIntro?: boolean;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  onSuccess?: () => void;
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

export default function PantryItemForm(
  props: PantryItemFormProps & PantryItemFormCallbacks,
) {
  const mode = props.mode ?? "create";
  const initialValues = mode === "edit" ? props.initialValues : undefined;
  const [name, setName] = useState(initialValues?.name ?? "");
  const [quantity, setQuantity] = useState(initialValues?.quantity ?? "");
  const [unit, setUnit] = useState(initialValues?.unit ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus>(null);
  const router = useRouter();

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
    props.onSubmittingChange?.(true);

    const pantryItem = {
      name: trimmedName,
      ...(trimmedQuantity ? { quantity: trimmedQuantity } : {}),
      ...(trimmedUnit ? { unit: trimmedUnit } : {}),
    };
    let wasSuccessful = false;

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
      wasSuccessful = true;
    } catch {
      setStatus({
        type: "error",
        message: "Unable to reach the server. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
      props.onSubmittingChange?.(false);
    }

    if (wasSuccessful) {
      props.onSuccess?.();
      if (mode === "edit") router.replace("/recipes")
    }
  }

  const inputClasses =
    "mt-1 w-full rounded-xl border border-[#d8d3c8] bg-white px-3 py-2 text-sm text-[#24342b] outline-none transition-colors placeholder:text-[#9aa39b] focus:border-[#35644f] focus:ring-2 focus:ring-[#35644f]/15 disabled:cursor-not-allowed disabled:bg-[#f4f1e8]";
  const labelClasses = "text-sm font-bold text-[#334238]";
  const optionalClasses = "font-semibold text-[#8b958c]";

  return (
    <form className="w-full space-y-5" onSubmit={handleSubmit}>
      <fieldset className="space-y-5" disabled={isSubmitting}>
        {props.hideIntro ? (
          <legend className="sr-only">
            {mode === "edit" ? "Edit pantry item" : "Add pantry item"}
          </legend>
        ) : (
          <>
            <legend className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]">
              {mode === "edit" ? "Edit pantry item" : "Add pantry item"}
            </legend>

            <p className="text-sm leading-6 text-[#6f7a71]">
              Track what is currently available in your pantry.
            </p>
          </>
        )}

        <div>
          <label
            className={labelClasses}
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
              className={labelClasses}
              htmlFor="pantry-item-quantity"
            >
              Quantity{" "}
              <span className={optionalClasses}>(optional)</span>
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
              className={labelClasses}
              htmlFor="pantry-item-unit"
            >
              Unit <span className={optionalClasses}>(optional)</span>
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

        <div className="flex flex-wrap items-center gap-3 border-t border-[#e5e1d8] pt-5">
          <button
            className="min-h-11 rounded-xl bg-[#35644f] px-5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.16)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
          >
            {isSubmitting
              ? mode === "edit"
                ? "Updating..."
                : "Adding..."
              : mode === "edit"
                ? "Update ingredient"
                : "Add ingredient"}
          </button>
        </div>
      </fieldset>

      {status ? (
        <p
          className={
            status.type === "success"
              ? "rounded-xl border border-[#d9e7d9] bg-[#f2f7f1] px-4 py-3 text-sm font-semibold text-[#35644f]"
              : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
          }
          role={status.type === "error" ? "alert" : "status"}
        >
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
