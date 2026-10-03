"use client";

import { useRef, useState, type SubmitEvent } from "react";

import RecipeForm, {
  type RecipeFormValues,
} from "@/components/RecipeForm";
import { recipeInputSchema } from "@/schemas/recipe";

type ImportRecipeDialogProps = {
  onRecipeCreated: () => void;
};

type DialogStep = "paste" | "review";

function responseErrorMessage(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return "Unable to import the recipe. Please try again.";
}

function parseDraft(payload: unknown): RecipeFormValues | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("draft" in payload)
  ) {
    return null;
  }

  const result = recipeInputSchema.safeParse(payload.draft);
  return result.success ? result.data : null;
}

export default function ImportRecipeDialog({
  onRecipeCreated,
}: ImportRecipeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const parsingRef = useRef(false);
  const savingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>("paste");
  const [sourceText, setSourceText] = useState("");
  const [draft, setDraft] = useState<RecipeFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function isBusy() {
    return parsingRef.current || savingRef.current;
  }

  function openDialog() {
    parsingRef.current = false;
    savingRef.current = false;
    setIsParsing(false);
    setIsSaving(false);
    setStep("paste");
    setSourceText("");
    setDraft(null);
    setError(null);
    setIsOpen(true);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function closeDialog() {
    if (!isBusy()) {
      dialogRef.current?.close();
    }
  }

  function handleClose() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  async function handleParse(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (parsingRef.current) {
      return;
    }

    const text = sourceText.trim();
    if (!text) {
      setError("Paste a recipe before continuing.");
      textareaRef.current?.focus();
      return;
    }

    parsingRef.current = true;
    setIsParsing(true);
    setError(null);

    try {
      const response = await fetch("/api/recipes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(responseErrorMessage(payload));
        return;
      }

      const parsedDraft = parseDraft(payload);
      if (!parsedDraft) {
        setError("The imported recipe was incomplete. Please try again.");
        return;
      }

      setDraft(parsedDraft);
      setStep("review");
      requestAnimationFrame(() => {
        dialogRef.current
          ?.querySelector<HTMLInputElement>("#recipe-name")
          ?.focus();
      });
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      parsingRef.current = false;
      setIsParsing(false);
    }
  }

  function returnToPaste() {
    if (isBusy()) {
      return;
    }

    setStep("paste");
    setError(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function handleSavingChange(saving: boolean) {
    savingRef.current = saving;
    setIsSaving(saving);
  }

  function handleCreated() {
    closeDialog();
    onRecipeCreated();
  }

  return (
    <>
      <button
        className="border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        Import recipe
      </button>

      <dialog
        aria-labelledby="import-recipe-dialog-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto border border-zinc-300 bg-white p-0 text-zinc-950 backdrop:bg-black/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        onCancel={(event) => {
          if (isBusy()) {
            event.preventDefault();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeDialog();
          }
        }}
        onClose={handleClose}
        ref={dialogRef}
      >
        {isOpen ? (
          <div className="p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
              <h2
                className="text-lg font-semibold"
                id="import-recipe-dialog-title"
              >
                Import recipe
              </h2>
              <button
                aria-label="Close import recipe dialog"
                className="border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                disabled={isParsing || isSaving}
                onClick={closeDialog}
                type="button"
              >
                Close
              </button>
            </div>

            {step === "paste" ? (
              <form className="space-y-5" onSubmit={handleParse}>
                <div>
                  <label
                    className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    htmlFor="recipe-source-text"
                  >
                    Recipe text
                  </label>
                  <p
                    className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
                    id="recipe-import-disclosure"
                  >
                    Pasted recipe text is sent to Google Gemini for conversion.
                  </p>
                  <textarea
                    aria-describedby={
                      error
                        ? "recipe-import-disclosure recipe-import-error"
                        : "recipe-import-disclosure"
                    }
                    className="mt-1 min-h-64 w-full resize-y border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition-colors focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-200 dark:focus:ring-zinc-200/20 dark:disabled:bg-zinc-900"
                    disabled={isParsing}
                    id="recipe-source-text"
                    maxLength={20000}
                    onChange={(event) => {
                      setSourceText(event.target.value);
                      setError(null);
                    }}
                    placeholder="Paste the recipe name, ingredients, and instructions"
                    ref={textareaRef}
                    required
                    value={sourceText}
                  />
                </div>

                {error ? (
                  <p
                    className="text-sm font-medium text-red-700 dark:text-red-400"
                    id="recipe-import-error"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}

                {isParsing ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
                    Converting recipe...
                  </p>
                ) : null}

                <button
                  className="h-11 bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                  disabled={isParsing}
                  type="submit"
                >
                  {isParsing ? "Converting..." : "Review recipe"}
                </button>
              </form>
            ) : draft ? (
              <div className="space-y-6">
                <button
                  className="border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  disabled={isSaving}
                  onClick={returnToPaste}
                  type="button"
                >
                  Back to pasted text
                </button>
                <RecipeForm
                  initialValues={draft}
                  onSubmittingChange={handleSavingChange}
                  onSuccess={handleCreated}
                />
              </div>
            ) : null}

            <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <button
                className="border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                disabled={isParsing || isSaving}
                onClick={closeDialog}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
