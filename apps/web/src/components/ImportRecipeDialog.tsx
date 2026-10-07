"use client";

import { useRef, useState, type ChangeEvent, type SubmitEvent } from "react";

import RecipeForm, {
  type RecipeFormValues,
} from "@/components/RecipeForm";
import { recipeInputSchema } from "@/schemas/recipe";

type ImportRecipeDialogProps = {
  onRecipeCreated: () => void;
  triggerClassName?: string;
  triggerLabel?: string;
};

type DialogStep = "paste" | "review";
type ImportMode = "text" | "image" | "url";

const supportedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const importModeOptions = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "url", label: "URL" },
] as const;
const maxImageBytes = 5 * 1024 * 1024;

function isSupportedImageType(type: string): type is (typeof supportedImageTypes)[number] {
  return supportedImageTypes.includes(
    type as (typeof supportedImageTypes)[number],
  );
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("missing file contents"));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("file read failed"));
    });
    reader.readAsDataURL(file);
  });
}

export default function ImportRecipeDialog({
  onRecipeCreated,
  triggerClassName,
  triggerLabel = "Import recipe",
}: ImportRecipeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const parsingRef = useRef(false);
  const savingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<DialogStep>("paste");
  const [importMode, setImportMode] = useState<ImportMode>("text");
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceImage, setSourceImage] = useState<File | null>(null);
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
    setImportMode("text");
    setSourceText("");
    setSourceUrl("");
    setSourceImage(null);
    setDraft(null);
    setError(null);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function closeDialog() {
    if (!isBusy()) {
      dialogRef.current?.close();
    }
  }

  function handleClose() {
    triggerRef.current?.focus();
  }

  function handleImportModeChange(mode: ImportMode) {
    setImportMode(mode);
    setError(null);
    requestAnimationFrame(() => {
      if (mode === "text") {
        textareaRef.current?.focus();
      } else if (mode === "image") {
        fileInputRef.current?.focus();
      } else {
        dialogRef.current
          ?.querySelector<HTMLInputElement>("#recipe-source-url")
          ?.focus();
      }
    });
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSourceImage(file);
    setError(null);
  }

  async function buildRequestBody() {
    if (importMode === "text") {
      const text = sourceText.trim();
      if (!text) {
        throw new Error("Paste a recipe before continuing.");
      }

      return { type: "text", text };
    }

    if (importMode === "url") {
      const url = sourceUrl.trim();
      if (!url) {
        throw new Error("Enter a recipe URL before continuing.");
      }

      return { type: "url", url };
    }

    if (!sourceImage) {
      throw new Error("Choose a recipe image before continuing.");
    }

    if (!isSupportedImageType(sourceImage.type)) {
      throw new Error("Choose a JPEG, PNG, or WebP image.");
    }

    if (sourceImage.size === 0) {
      throw new Error("Choose an image that is not empty.");
    }

    if (sourceImage.size > maxImageBytes) {
      throw new Error("Choose an image smaller than 5 MB.");
    }

    const dataUrl = await readFileAsDataUrl(sourceImage).catch(() => {
      throw new Error("Unable to read that image. Please choose another file.");
    });
    const [, data = ""] = dataUrl.split(",", 2);
    if (!data) {
      throw new Error("Unable to read that image. Please choose another file.");
    }

    return {
      type: "image",
      image: {
        mimeType: sourceImage.type,
        data,
      },
    };
  }

  async function handleParse(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (parsingRef.current) {
      return;
    }

    parsingRef.current = true;
    setIsParsing(true);
    setError(null);

    try {
      let requestBody: Awaited<ReturnType<typeof buildRequestBody>>;
      try {
        requestBody = await buildRequestBody();
      } catch (buildError) {
        setError(
          buildError instanceof Error
            ? buildError.message
            : "Check the recipe source before continuing.",
        );
        if (importMode === "text") {
          textareaRef.current?.focus();
        } else if (importMode === "image") {
          fileInputRef.current?.focus();
        } else {
          dialogRef.current
            ?.querySelector<HTMLInputElement>("#recipe-source-url")
            ?.focus();
        }
        return;
      }

      const response = await fetch("/api/recipes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
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
    requestAnimationFrame(() => {
      if (importMode === "text") {
        textareaRef.current?.focus();
      } else if (importMode === "image") {
        fileInputRef.current?.focus();
      } else {
        dialogRef.current
          ?.querySelector<HTMLInputElement>("#recipe-source-url")
          ?.focus();
      }
    });
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
        className={
          triggerClassName ??
          "rounded-xl border border-[#ded9cf] bg-white px-4 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
        }
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        {triggerLabel}
      </button>

      <dialog
        aria-labelledby="import-recipe-dialog-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-[#ded9cf] bg-[#fbfaf6] p-0 text-[#24342b] shadow-[0_24px_60px_rgba(42,48,38,0.18)] backdrop:bg-[#24342b]/35"
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
        <div className="p-5 sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-[#e5e1d8] pb-4">
            <h2
              className="[font-family:Georgia,serif] text-2xl font-bold text-[#24342b]"
              id="import-recipe-dialog-title"
            >
              Import recipe
            </h2>
            <button
              aria-label="Close import recipe dialog"
              className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isParsing || isSaving}
              onClick={closeDialog}
              type="button"
            >
              Close
            </button>
          </div>

          {step === "paste" ? (
            <form className="space-y-5" onSubmit={handleParse}>
              <fieldset className="space-y-2">
                <legend className="text-sm font-bold text-[#334238]">
                  Import from
                </legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {importModeOptions.map((option) => (
                    <label
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#6f7a71] transition-colors has-[:checked]:border-[#35644f] has-[:checked]:bg-[#e8f1e9] has-[:checked]:text-[#285843] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                      key={option.value}
                    >
                      <input
                        checked={importMode === option.value}
                        disabled={isParsing}
                        name="recipe-import-mode"
                        onChange={() =>
                          handleImportModeChange(option.value)
                        }
                        type="radio"
                        value={option.value}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                {importMode === "text" ? (
                  <label
                    className="text-sm font-bold text-[#334238]"
                    htmlFor="recipe-source-text"
                  >
                    Recipe text
                  </label>
                ) : null}
                {importMode === "image" ? (
                  <label
                    className="text-sm font-bold text-[#334238]"
                    htmlFor="recipe-source-image"
                  >
                    Recipe image
                  </label>
                ) : null}
                {importMode === "url" ? (
                  <label
                    className="text-sm font-bold text-[#334238]"
                    htmlFor="recipe-source-url"
                  >
                    Recipe URL
                  </label>
                ) : null}
                <p
                  className="mt-1 text-xs font-semibold text-[#8b958c]"
                  id="recipe-import-disclosure"
                >
                  Recipe sources are sent to Google Gemini for conversion.
                </p>
                {importMode === "text" ? (
                  <textarea
                    aria-describedby={
                      error
                        ? "recipe-import-disclosure recipe-import-error"
                        : "recipe-import-disclosure"
                    }
                    className="mt-1 min-h-64 w-full resize-y rounded-xl border border-[#d8d3c8] bg-white px-3 py-2 text-sm text-[#24342b] outline-none transition-colors placeholder:text-[#9aa39b] focus:border-[#35644f] focus:ring-2 focus:ring-[#35644f]/15 disabled:cursor-not-allowed disabled:bg-[#f4f1e8]"
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
                ) : null}
                {importMode === "image" ? (
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    aria-describedby={
                      error
                        ? "recipe-import-disclosure recipe-import-error"
                        : "recipe-import-disclosure"
                    }
                    className="mt-1 w-full rounded-xl border border-[#d8d3c8] bg-white px-3 py-2 text-sm text-[#24342b] file:mr-3 file:rounded-lg file:border-0 file:bg-[#35644f] file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white disabled:cursor-not-allowed disabled:bg-[#f4f1e8]"
                    disabled={isParsing}
                    id="recipe-source-image"
                    onChange={handleImageChange}
                    ref={fileInputRef}
                    required
                    type="file"
                  />
                ) : null}
                {importMode === "url" ? (
                  <input
                    aria-describedby={
                      error
                        ? "recipe-import-disclosure recipe-import-error"
                        : "recipe-import-disclosure"
                    }
                    className="mt-1 h-11 w-full rounded-xl border border-[#d8d3c8] bg-white px-3 py-2 text-sm text-[#24342b] outline-none transition-colors placeholder:text-[#9aa39b] focus:border-[#35644f] focus:ring-2 focus:ring-[#35644f]/15 disabled:cursor-not-allowed disabled:bg-[#f4f1e8]"
                    disabled={isParsing}
                    id="recipe-source-url"
                    maxLength={2048}
                    onChange={(event) => {
                      setSourceUrl(event.target.value);
                      setError(null);
                    }}
                    placeholder="https://example.com/recipes/french-toast"
                    required
                    type="url"
                    value={sourceUrl}
                  />
                ) : null}
              </div>

              {error ? (
                <p
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
                  id="recipe-import-error"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              {isParsing ? (
                <p
                  className="text-sm font-semibold text-[#6f7a71]"
                  role="status"
                >
                  Converting recipe...
                </p>
              ) : null}

              <button
                className="min-h-11 rounded-xl bg-[#35644f] px-5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.16)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isParsing}
                type="submit"
              >
                {isParsing ? "Converting..." : "Review recipe"}
              </button>
            </form>
          ) : draft ? (
            <div className="space-y-6">
              <button
                className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                onClick={returnToPaste}
                type="button"
              >
                Back to import source
              </button>
              <RecipeForm
                initialValues={draft}
                onSubmittingChange={handleSavingChange}
                onSuccess={handleCreated}
              />
            </div>
          ) : null}

          <div className="mt-6 border-t border-[#e5e1d8] pt-4">
            <button
              className="rounded-lg border border-[#ded9cf] bg-white px-4 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isParsing || isSaving}
              onClick={closeDialog}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
