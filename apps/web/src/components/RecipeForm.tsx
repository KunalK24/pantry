"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from "react";

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

export type RecipeImageCandidate =
  | { kind: "source_url"; url: string; importJobId: string }
  | { kind: "source_upload"; file: File };

type RecipeFormProps = (
  | {
      mode?: "create";
      initialValues?: RecipeFormValues;
      recipeId?: never;
    }
  | { mode: "edit"; initialValues: RecipeFormValues; recipeId: string }
) & {
  initialImageUrl?: string | null;
  imageCandidate?: RecipeImageCandidate | null;
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

const MAX_INGREDIENTS = 100;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const supportedImageTypes = ["image/jpeg", "image/png", "image/webp"];
type ImageChoice = "keep" | "omit" | "upload" | "suggested";

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
  const submittingRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
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
  const [imageChoice, setImageChoice] = useState<ImageChoice>(props.imageCandidate ? "omit" : "keep");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [candidateImagePreview, setCandidateImagePreview] = useState<string | null>(null);
  const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
  const [pendingImageSave, setPendingImageSave] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const previewFile = imageChoice === "upload" ? imageFile : null;
    if (!previewFile) {
      return;
    }
    const url = URL.createObjectURL(previewFile);
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setImagePreview(url);
      }
    });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [imageChoice, imageFile]);

  useEffect(() => {
    const file = props.imageCandidate?.kind === "source_upload" ? props.imageCandidate.file : null;
    if (!file) {
      return;
    }
    const url = URL.createObjectURL(file);
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setCandidateImagePreview(url);
      }
    });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [props.imageCandidate]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }
    if (!supportedImageTypes.includes(file.type) || file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      setStatus({ type: "error", message: "Choose a nonempty JPEG, PNG, or WebP image smaller than 5 MB." });
      event.target.value = "";
      return;
    }
    setImageFile(file);
    setImageChoice("upload");
    setStatus(null);
  }

  async function saveImage(recipeId: string) {
    const endpoint = `/api/recipes/${recipeId}/image`;
    if (imageChoice === "keep" || (imageChoice === "omit" && !props.initialImageUrl)) {
      return;
    }
    if (imageChoice === "omit") {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(responseErrorMessage(await response.json().catch(() => null)));
      }
      return;
    }
    const candidate = props.imageCandidate;
    if (imageChoice === "suggested" && candidate?.kind === "source_url") {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importJobId: candidate.importJobId }),
      });
      if (!response.ok) {
        throw new Error(responseErrorMessage(await response.json().catch(() => null)));
      }
      return;
    }
    const file = imageChoice === "upload" ? imageFile : candidate?.kind === "source_upload" ? candidate.file : null;
    if (!file) {
      throw new Error("Choose a cover image before saving.");
    }
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(endpoint, { method: "POST", body });
    if (!response.ok) {
      throw new Error(responseErrorMessage(await response.json().catch(() => null)));
    }
  }

  async function retryImageSave() {
    if (submittingRef.current || !pendingImageSave) {
      return;
    }
    const recipeId = mode === "edit" ? props.recipeId : savedRecipeId;
    if (!recipeId) {
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    props.onSubmittingChange?.(true);
    setStatus(null);
    try {
      await saveImage(recipeId);
      setPendingImageSave(false);
      setSavedRecipeId(null);
      if (mode === "create") {
        setName("");
        setDescription("");
        setInstructions("");
        setIngredients([emptyIngredient(nextIngredientId.current++)]);
        setImageFile(null);
        if (imageInputRef.current) {
          imageInputRef.current.value = "";
        }
        setImageChoice("keep");
      }
      setStatus({ type: "success", message: "Recipe image saved successfully." });
      props.onSuccess?.();
      if (mode === "edit") {
        router.replace("/recipes");
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: `Recipe saved, but the cover image could not be saved: ${error instanceof Error ? error.message : "Please try again."}`,
      });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      props.onSubmittingChange?.(false);
    }
  }

  function addIngredient() {
    if (ingredients.length >= MAX_INGREDIENTS) {
      return;
    }

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

    if (submittingRef.current) {
      return;
    }

    if (pendingImageSave) {
      await retryImageSave();
      return;
    }

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

    if (normalizedIngredients.length > MAX_INGREDIENTS) {
      setStatus({
        type: "error",
        message: "A recipe can have at most 100 ingredients.",
      });
      return;
    }

    if (
      trimmedName.length > 200 ||
      trimmedDescription.length > 2000 ||
      trimmedInstructions.length > 20000 ||
      normalizedIngredients.some(
        (ingredient) =>
          ingredient.name.length > 200 ||
          ingredient.quantity.length > 100 ||
          (ingredient.unit?.length ?? 0) > 100,
      )
    ) {
      setStatus({
        type: "error",
        message: "Some recipe fields are too long. Shorten them before saving.",
      });
      return;
    }

    submittingRef.current = true;
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
        mode === "edit" || savedRecipeId ? `/api/recipes/${mode === "edit" ? props.recipeId : savedRecipeId}` : "/api/recipes";
      const response = await fetch(endpoint, {
        method: mode === "edit" || savedRecipeId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        setStatus({ type: "error", message: responseErrorMessage(payload) });
        return;
      }

      let recipeId = mode === "edit" ? props.recipeId : savedRecipeId;
      if (!recipeId) {
        const payload: unknown = await response.json().catch(() => null);
        if (typeof payload !== "object" || payload === null || !("id" in payload) || typeof payload.id !== "string") {
          setStatus({ type: "error", message: "Recipe saved, but its image could not be attached. Reload your recipe library to finish editing." });
          return;
        }
        recipeId = payload.id;
        setSavedRecipeId(recipeId);
      }

      try {
        await saveImage(recipeId);
      } catch (imageError) {
        setPendingImageSave(true);
        setStatus({
          type: "error",
          message: `Recipe saved, but the cover image could not be saved: ${imageError instanceof Error ? imageError.message : "Please try again."}`,
        });
        return;
      }

      if (mode === "create") {
        setName("");
        setDescription("");
        setInstructions("");
        setIngredients([emptyIngredient(nextIngredientId.current++)]);
        setSavedRecipeId(null);
        setImageChoice("keep");
        setImageFile(null);
        if (imageInputRef.current) {
          imageInputRef.current.value = "";
        }
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
      submittingRef.current = false;
      setIsSubmitting(false);
      props.onSubmittingChange?.(false);
    }

    if (wasSuccessful) {
      props.onSuccess?.();
      if (mode === "edit") {
        router.replace("/recipes");
      }
    }
  }

  const inputClasses =
    "mt-1 w-full rounded-xl border border-[#d8d3c8] bg-white px-3 py-2 text-sm text-[#24342b] outline-none transition-colors placeholder:text-[#9aa39b] focus:border-[#35644f] focus:ring-2 focus:ring-[#35644f]/15 disabled:cursor-not-allowed disabled:bg-[#f4f1e8]";
  const labelClasses = "text-sm font-bold text-[#334238]";
  const optionalClasses = "font-semibold text-[#8b958c]";
  const candidate = props.imageCandidate;
  const visibleImage = imageChoice === "upload"
    ? imagePreview
    : imageChoice === "keep" ? props.initialImageUrl : null;
  const candidatePreview = candidate?.kind === "source_url"
    ? candidate.url
    : candidate?.kind === "source_upload" ? candidateImagePreview : null;

  return (
    <form className="w-full space-y-6" onSubmit={handleSubmit}>
      <fieldset className="space-y-6" disabled={isSubmitting || pendingImageSave}>
        <legend className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]">
          {mode === "edit" ? "Edit recipe" : "Create recipe"}
        </legend>

        <div>
          <label className={labelClasses} htmlFor="recipe-name">
            Recipe name
          </label>
          <input
            className={inputClasses}
            id="recipe-name"
            maxLength={200}
            name="name"
            onChange={(event) => {
              setStatus(null);
              setName(event.target.value);
            }}
            required
            type="text"
            value={name}
          />
        </div>

        <div>
          <label className={labelClasses} htmlFor="recipe-description">
            Description <span className={optionalClasses}>(optional)</span>
          </label>
          <textarea
            className={inputClasses}
            id="recipe-description"
            maxLength={2000}
            name="description"
            onChange={(event) => {
              setStatus(null);
              setDescription(event.target.value);
            }}
            rows={3}
            value={description}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className={labelClasses}>Cover image <span className={optionalClasses}>(optional)</span></legend>
          {candidatePreview ? (
            <figure>
              <img alt="Suggested recipe cover" className="aspect-[4/3] w-full max-w-64 rounded-xl object-cover" src={candidatePreview} />
              <figcaption className="mt-1 text-xs text-[#6f7a71]">Suggested image from the recipe source. Choose whether to use it.</figcaption>
            </figure>
          ) : null}
          {visibleImage ? (
            <img alt="Selected recipe cover preview" className="aspect-[4/3] w-full max-w-64 rounded-xl object-cover" src={visibleImage} />
          ) : !candidatePreview ? <p className="text-sm text-[#6f7a71]">No cover image selected.</p> : null}
          {candidate ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-[#334238]">
              <input checked={imageChoice === "suggested"} onChange={() => { setImageChoice("suggested"); setStatus(null); }} type="radio" name="recipe-image-choice" />
              Use suggested image
            </label>
          ) : null}
          {props.initialImageUrl ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-[#334238]">
              <input checked={imageChoice === "keep"} onChange={() => { setImageChoice("keep"); setStatus(null); }} type="radio" name="recipe-image-choice" />
              Keep current image
            </label>
          ) : null}
          <div>
            <label className={labelClasses} htmlFor="recipe-cover-image">Upload or replace image</label>
            <input accept="image/jpeg,image/png,image/webp" className={inputClasses} id="recipe-cover-image" onChange={handleImageChange} ref={imageInputRef} type="file" />
            <p className="mt-1 text-xs text-[#6f7a71]">JPEG, PNG, or WebP, up to 5 MB.</p>
          </div>
          {(candidate || props.initialImageUrl || imageChoice === "upload") ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-[#334238]">
              <input checked={imageChoice === "omit"} onChange={() => { setImageChoice("omit"); setStatus(null); }} type="radio" name="recipe-image-choice" />
              {props.initialImageUrl ? "Remove cover image" : "Save without an image"}
            </label>
          ) : null}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="[font-family:Georgia,serif] text-xl font-bold text-[#24342b]">
            Ingredients
          </legend>
          <div className="flex justify-end">
            <button
              className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={addIngredient}
              disabled={ingredients.length >= MAX_INGREDIENTS}
              type="button"
            >
              Add ingredient
            </button>
          </div>
          {ingredients.length >= MAX_INGREDIENTS ? (
            <p className="text-sm font-semibold text-[#6f7a71]" role="status">
              Maximum of 100 ingredients reached.
            </p>
          ) : null}

          <div className="space-y-4">
            {ingredients.map((ingredient, index) => (
              <div
                className="grid gap-3 border-t border-[#e5e1d8] pt-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                key={ingredient.id}
              >
                <div>
                  <label
                    className={labelClasses}
                    htmlFor={`ingredient-name-${ingredient.id}`}
                  >
                    Ingredient {index + 1}
                  </label>
                  <input
                    className={inputClasses}
                    id={`ingredient-name-${ingredient.id}`}
                    maxLength={200}
                    name={`ingredients.${index}.name`}
                    onChange={(event) =>
                      updateIngredient(
                        ingredient.id,
                        "name",
                        event.target.value,
                      )
                    }
                    required
                    type="text"
                    value={ingredient.name}
                  />
                </div>

                <div>
                  <label
                    className={labelClasses}
                    htmlFor={`ingredient-quantity-${ingredient.id}`}
                  >
                    Quantity
                  </label>
                  <input
                    className={inputClasses}
                    id={`ingredient-quantity-${ingredient.id}`}
                    maxLength={100}
                    name={`ingredients.${index}.quantity`}
                    onChange={(event) =>
                      updateIngredient(
                        ingredient.id,
                        "quantity",
                        event.target.value,
                      )
                    }
                    placeholder="1/2 or to taste"
                    required
                    type="text"
                    value={ingredient.quantity}
                  />
                </div>

                <div>
                  <label
                    className={labelClasses}
                    htmlFor={`ingredient-unit-${ingredient.id}`}
                  >
                    Unit <span className={optionalClasses}>(optional)</span>
                  </label>
                  <input
                    className={inputClasses}
                    id={`ingredient-unit-${ingredient.id}`}
                    maxLength={100}
                    name={`ingredients.${index}.unit`}
                    onChange={(event) =>
                      updateIngredient(
                        ingredient.id,
                        "unit",
                        event.target.value,
                      )
                    }
                    type="text"
                    value={ingredient.unit}
                  />
                </div>

                <button
                  aria-label={`Remove ingredient ${index + 1}`}
                  className="h-10 rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={ingredients.length === 1}
                  onClick={() => removeIngredient(ingredient.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </fieldset>

        <div>
          <label className={labelClasses} htmlFor="recipe-instructions">
            Instructions
          </label>
          <textarea
            className={inputClasses}
            id="recipe-instructions"
            maxLength={20000}
            name="instructions"
            onChange={(event) => {
              setStatus(null);
              setInstructions(event.target.value);
            }}
            required
            rows={6}
            value={instructions}
          />
        </div>

        <button
          className="min-h-11 rounded-xl bg-[#35644f] px-5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.16)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
        >
          {isSubmitting
            ? mode === "edit"
              ? "Updating..."
              : "Saving..."
            : mode === "edit"
              ? "Update recipe"
              : "Save recipe"}
        </button>
      </fieldset>

      {pendingImageSave ? (
        <div className="flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded-xl bg-[#35644f] px-5 text-sm font-bold text-white disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => void retryImageSave()}
            type="button"
          >
            {isSubmitting ? "Retrying image..." : "Retry image save"}
          </button>
          <button
            className="min-h-11 rounded-xl border border-[#ded9cf] px-5 text-sm font-bold text-[#35644f] disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => {
              setPendingImageSave(false);
              setSavedRecipeId(null);
              if (mode === "create") {
                setName("");
                setDescription("");
                setInstructions("");
                setIngredients([emptyIngredient(nextIngredientId.current++)]);
                setImageFile(null);
                if (imageInputRef.current) {
                  imageInputRef.current.value = "";
                }
                setImageChoice("keep");
              }
              setStatus({ type: "success", message: "Recipe saved. Its cover image was not changed." });
              props.onSuccess?.();
              if (mode === "edit") {
                router.replace("/recipes");
              }
            }}
            type="button"
          >
            Continue without image
          </button>
        </div>
      ) : null}

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
