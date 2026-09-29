"use client";

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

type RecipeFormProps =
  | { mode?: "create"; initialValues?: never; recipeId?: never }
  | { mode: "edit"; initialValues: RecipeFormValues; recipeId: string };

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
  const initialValues = mode === "edit" ? props.initialValues : undefined;
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

    const recipe = {
      name: trimmedName,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      instructions: trimmedInstructions,
      ingredients: normalizedIngredients,
    };

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
    "mt-1 w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition-colors focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-200 dark:focus:ring-zinc-200/20 dark:disabled:bg-zinc-900";

  return (
    <form className="w-full space-y-6" onSubmit={handleSubmit}>
      <fieldset className="space-y-6" disabled={isSubmitting}>
        <legend className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          {mode === "edit" ? "Edit recipe" : "Create recipe"}
        </legend>

        <div>
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="recipe-name">
            Recipe name
          </label>
          <input className={inputClasses} id="recipe-name" name="name" onChange={(event) => {
            setStatus(null);
            setName(event.target.value);
          }} required type="text" value={name} />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="recipe-description">
            Description <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <textarea className={inputClasses} id="recipe-description" name="description" onChange={(event) => {
            setStatus(null);
            setDescription(event.target.value);
          }} rows={3} value={description} />
        </div>

        <fieldset className="space-y-4">
          <legend className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Ingredients
          </legend>
          <div className="flex justify-end">
            <button className="border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900" onClick={addIngredient} type="button">
              Add ingredient
            </button>
          </div>

          <div className="space-y-4">
            {ingredients.map((ingredient, index) => (
              <div className="grid gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" key={ingredient.id}>
                <div>
                  <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor={`ingredient-name-${ingredient.id}`}>
                    Ingredient {index + 1}
                  </label>
                  <input className={inputClasses} id={`ingredient-name-${ingredient.id}`} name={`ingredients.${index}.name`} onChange={(event) => updateIngredient(ingredient.id, "name", event.target.value)} required type="text" value={ingredient.name} />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor={`ingredient-quantity-${ingredient.id}`}>Quantity</label>
                  <input className={inputClasses} id={`ingredient-quantity-${ingredient.id}`} name={`ingredients.${index}.quantity`} onChange={(event) => updateIngredient(ingredient.id, "quantity", event.target.value)} placeholder="1/2 or to taste" required type="text" value={ingredient.quantity} />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor={`ingredient-unit-${ingredient.id}`}>
                    Unit <span className="font-normal text-zinc-500">(optional)</span>
                  </label>
                  <input className={inputClasses} id={`ingredient-unit-${ingredient.id}`} name={`ingredients.${index}.unit`} onChange={(event) => updateIngredient(ingredient.id, "unit", event.target.value)} type="text" value={ingredient.unit} />
                </div>

                <button aria-label={`Remove ingredient ${index + 1}`} className="h-10 border border-red-300 px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40" disabled={ingredients.length === 1} onClick={() => removeIngredient(ingredient.id)} type="button">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="recipe-instructions">Instructions</label>
          <textarea className={inputClasses} id="recipe-instructions" name="instructions" onChange={(event) => {
            setStatus(null);
            setInstructions(event.target.value);
          }} required rows={6} value={instructions} />
        </div>

        <button className="h-11 bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white" type="submit">
          {isSubmitting
            ? mode === "edit" ? "Updating..." : "Saving..."
            : mode === "edit" ? "Update recipe" : "Save recipe"}
        </button>
      </fieldset>

      {status ? (
        <p className={status.type === "success" ? "text-sm font-medium text-green-700 dark:text-green-400" : "text-sm font-medium text-red-700 dark:text-red-400"} role={status.type === "error" ? "alert" : "status"}>
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
