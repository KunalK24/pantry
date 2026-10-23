"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type SubmitEvent } from "react";

export type RecipeIngredientValue = {
  name: string;
  quantity: string;
  unit?: string | null;
};

export type RecipeFormValues = {
  name: string;
  description?: string | null;
  instructions: string;
  ingredients: RecipeIngredientValue[];
};

type RecipeFormProps = (
  | {
      mode?: "create";
      initialValues?: RecipeFormValues;
      recipeId?: never;
    }
  | { mode: "edit"; initialValues: RecipeFormValues; recipeId: string }
) & {
  onSubmittingChange?: (isSubmitting: boolean) => void;
  onSuccess?: () => void;
};

type IngredientRow = {
  id: number;
  name: string;
  quantity: string;
  unit: string;
};

type SubmissionStatus =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

const emptyIngredient = (id: number): IngredientRow => ({
  id,
  name: "",
  quantity: "",
  unit: "",
});

function initialIngredientRows(values?: RecipeFormValues) {
  if (!values?.ingredients.length) {
    return [emptyIngredient(0)];
  }

  return values.ingredients.map((ingredient, id) => ({
    id,
    name: ingredient.name,
    quantity: ingredient.quantity ?? "",
    unit: ingredient.unit ?? "",
  }));
}

function responseErrorMessage(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return "Unable to save the recipe. Please try again.";
}

export default function RecipeForm(props: RecipeFormProps) {
  const mode = props.mode ?? "create";
  const initialValues = props.initialValues;
  const initialRows = initialIngredientRows(initialValues);
  const nextIngredientId = useRef(initialRows.length);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [instructions, setInstructions] = useState(
    initialValues?.instructions ?? "",
  );
  const [ingredients, setIngredients] = useState<IngredientRow[]>(initialRows);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus>(null);
  const router = useRouter();

  function addIngredient() {
    setStatus(null);
    setIngredients((current) => [
      ...current,
      emptyIngredient(nextIngredientId.current++),
    ]);
  }

  function updateIngredient(
    id: number,
    field: "name" | "quantity" | "unit",
    value: string,
  ) {
    setStatus(null);
    setIngredients((current) =>
      current.map((ingredient) =>
        ingredient.id === id ? { ...ingredient, [field]: value } : ingredient,
      ),
    );
  }

  function removeIngredient(id: number) {
    setStatus(null);
    setIngredients((current) =>
      current.length === 1
        ? current
        : current.filter((ingredient) => ingredient.id !== id),
    );
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedInstructions = instructions.trim();
    const normalizedIngredients = ingredients.map((ingredient) => {
      const unit = ingredient.unit.trim();

      return {
        name: ingredient.name.trim(),
        quantity: ingredient.quantity.trim(),
        ...(unit ? { unit } : {}),
      };
    });

    if (
      !trimmedName ||
      !trimmedInstructions ||
      normalizedIngredients.some(
        (ingredient) => !ingredient.name || !ingredient.quantity,
      )
    ) {
      setStatus({
        type: "error",
        message: "Complete all required fields before saving the recipe.",
      });
      return;
    }

    setIsSubmitting(true);
    props.onSubmittingChange?.(true);

    const recipe = {
      name: trimmedName,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      instructions: trimmedInstructions,
      ingredients: normalizedIngredients,
    };
    let wasSuccessful = false;

    try {
      const endpoint =
        mode === "edit" ? `/api/recipes/${props.recipeId}` : "/api/recipes";
      const response = await fetch(endpoint, {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        setStatus({ type: "error", message: responseErrorMessage(payload) });
        return;
      }

      if (mode === "create") {
        setName("");
        setDescription("");
        setInstructions("");
        setIngredients([emptyIngredient(nextIngredientId.current++)]);
        setStatus({ type: "success", message: "Recipe saved successfully." });
      } else {
        setStatus({ type: "success", message: "Recipe updated successfully." });
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
      if (mode === "edit") router.replace("/recipes");
    }
  }

  const inputClasses =
    "mt-1 w-full rounded-xl border border-[#d8d3c8] bg-white px-3 py-2 text-sm text-[#24342b] outline-none transition-colors placeholder:text-[#9aa39b] focus:border-[#35644f] focus:ring-2 focus:ring-[#35644f]/15 disabled:cursor-not-allowed disabled:bg-[#f4f1e8]";
  const labelClasses = "text-sm font-bold text-[#334238]";
  const optionalClasses = "font-semibold text-[#8b958c]";

  return (
    <form className="w-full space-y-6" onSubmit={handleSubmit}>
      <fieldset className="space-y-6" disabled={isSubmitting}>
        <legend className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]">
          {mode === "edit" ? "Edit recipe" : "Create recipe"}
        </legend>

        <div>
          <label className={labelClasses} htmlFor="recipe-name">
            Recipe name
          </label>
          <input className={inputClasses} id="recipe-name" name="name" onChange={(event) => {
            setStatus(null);
            setName(event.target.value);
          }} required type="text" value={name} />
        </div>

        <div>
          <label className={labelClasses} htmlFor="recipe-description">
            Description <span className={optionalClasses}>(optional)</span>
          </label>
          <textarea className={inputClasses} id="recipe-description" name="description" onChange={(event) => {
            setStatus(null);
            setDescription(event.target.value);
          }} rows={3} value={description} />
        </div>

        <fieldset className="space-y-4">
          <legend className="[font-family:Georgia,serif] text-xl font-bold text-[#24342b]">
            Ingredients
          </legend>
          <div className="flex justify-end">
            <button className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60" onClick={addIngredient} type="button">
              Add ingredient
            </button>
          </div>

          <div className="space-y-4">
            {ingredients.map((ingredient, index) => (
              <div className="grid gap-3 border-t border-[#e5e1d8] pt-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" key={ingredient.id}>
                <div>
                  <label className={labelClasses} htmlFor={`ingredient-name-${ingredient.id}`}>
                    Ingredient {index + 1}
                  </label>
                  <input className={inputClasses} id={`ingredient-name-${ingredient.id}`} name={`ingredients.${index}.name`} onChange={(event) => updateIngredient(ingredient.id, "name", event.target.value)} required type="text" value={ingredient.name} />
                </div>

                <div>
                  <label className={labelClasses} htmlFor={`ingredient-quantity-${ingredient.id}`}>Quantity</label>
                  <input className={inputClasses} id={`ingredient-quantity-${ingredient.id}`} name={`ingredients.${index}.quantity`} onChange={(event) => updateIngredient(ingredient.id, "quantity", event.target.value)} placeholder="1/2 or to taste" required type="text" value={ingredient.quantity} />
                </div>

                <div>
                  <label className={labelClasses} htmlFor={`ingredient-unit-${ingredient.id}`}>
                    Unit <span className={optionalClasses}>(optional)</span>
                  </label>
                  <input className={inputClasses} id={`ingredient-unit-${ingredient.id}`} name={`ingredients.${index}.unit`} onChange={(event) => updateIngredient(ingredient.id, "unit", event.target.value)} type="text" value={ingredient.unit} />
                </div>

                <button aria-label={`Remove ingredient ${index + 1}`} className="h-10 rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={ingredients.length === 1} onClick={() => removeIngredient(ingredient.id)} type="button">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </fieldset>

        <div>
          <label className={labelClasses} htmlFor="recipe-instructions">Instructions</label>
          <textarea className={inputClasses} id="recipe-instructions" name="instructions" onChange={(event) => {
            setStatus(null);
            setInstructions(event.target.value);
          }} required rows={6} value={instructions} />
        </div>

        <button className="min-h-11 rounded-xl bg-[#35644f] px-5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.16)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60" type="submit">
          {isSubmitting
            ? mode === "edit" ? "Updating..." : "Saving..."
            : mode === "edit" ? "Update recipe" : "Save recipe"}
        </button>
      </fieldset>

      {status ? (
        <p className={status.type === "success" ? "rounded-xl border border-[#d9e7d9] bg-[#f2f7f1] px-4 py-3 text-sm font-semibold text-[#35644f]" : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"} role={status.type === "error" ? "alert" : "status"}>
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
