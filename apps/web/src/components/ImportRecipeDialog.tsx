"use client";

import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import { z } from "zod";

import RecipeForm, {
  type RecipeFormValues,
} from "@/components/RecipeForm";
import { recipeInputSchema } from "@/schemas/recipe";
import { aiJobIdSchema } from "@/schemas/ai-job";

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
const importTimeoutMs = 120_000;
const jobPollIntervalMs = 1_500;

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

function parseDraft(value: unknown): RecipeFormValues | null {
  const result = recipeInputSchema.safeParse(value);
  return result.success ? result.data : null;
}

function parseJobId(payload: unknown): string | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("id" in payload)
  ) {
    return null;
  }

  const result = aiJobIdSchema.safeParse(payload.id);
  return result.success ? result.data : null;
}

const jobStatusResponseSchema = z.object({
  id: aiJobIdSchema,
  status: z.enum(["queued", "processing", "retrying", "succeeded", "failed", "canceled"]),
  sourceType: z.enum(["text", "image", "url"]),
  stage: z.string().nullable(),
  draft: z.unknown(),
  error: z.object({
    code: z.string().nullable(),
    message: z.string().nullable(),
  }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
});

function waitForNextPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, jobPollIntervalMs);

    function handleAbort() {
      window.clearTimeout(timeoutId);
      reject(signal.reason);
    }

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

async function cancelJob(jobId: string) {
  try {
    const response = await fetch(`/api/recipe-imports/${jobId}/cancel`, {
      method: "POST",
    });
    if (!response.ok) {
      console.error("[recipe-import-ui] cancellation failed", { jobId, status: response.status });
    }
  } catch (error) {
    console.error("[recipe-import-ui] cancellation request failed", { jobId, error });
  }
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
  const requestAbortRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const importGenerationRef = useRef(0);
  const savingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<DialogStep>("paste");
  const [importMode, setImportMode] = useState<ImportMode>("text");
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [draft, setDraft] = useState<RecipeFormValues | null>(null);
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stage, setStage] = useState<string | null>(null);

  useEffect(() => () => {
    importGenerationRef.current += 1;
    requestAbortRef.current?.abort();
    const jobId = activeJobIdRef.current;
    if (jobId) {
      void cancelJob(jobId);
    }
  }, []);

  function isBusy() {
    return parsingRef.current || savingRef.current;
  }

  function openDialog() {
    importGenerationRef.current += 1;
    activeJobIdRef.current = null;
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
    setDraftJobId(null);
    setError(null);
    setStage(null);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function closeDialog() {
    if (savingRef.current) {
      return;
    }

    importGenerationRef.current += 1;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    const jobId = activeJobIdRef.current;
    activeJobIdRef.current = null;
    if (jobId) {
      void cancelJob(jobId);
    }
    parsingRef.current = false;
    setIsParsing(false);
    setStage(null);
    dialogRef.current?.close();
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
    setStage("Starting import...");

    const generation = ++importGenerationRef.current;
    const controller = new AbortController();
    const deadlineSignal = AbortSignal.timeout(importTimeoutMs);
    const requestSignal = AbortSignal.any([controller.signal, deadlineSignal]);
    requestAbortRef.current = controller;
    const isCurrent = () => importGenerationRef.current === generation;

    try {
      let requestBody: Awaited<ReturnType<typeof buildRequestBody>>;
      try {
        requestBody = await buildRequestBody();
      } catch (buildError) {
        if (!isCurrent()) return;
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

      if (!isCurrent()) return;

      const response = await fetch("/api/recipe-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        // Keep creation alive after close so its returned ID can be canceled.
        signal: deadlineSignal,
      });
      const jobPostPayload: unknown = await response.json().catch(() => null);

      if (!isCurrent()) {
        const abandonedJobId = parseJobId(jobPostPayload);
        if (response.ok && abandonedJobId) void cancelJob(abandonedJobId);
        return;
      }

      if (!response.ok) {
        setError(responseErrorMessage(jobPostPayload));
        return;
      }

      const jobId = parseJobId(jobPostPayload);
      if (!jobId) {
        setError("The import could not be started. Please try again.");
        return;
      }
      activeJobIdRef.current = jobId;

      console.info("[recipe-import-ui] job created", {
        jobId,
        timeoutMs: importTimeoutMs,
      });

      let previousStatus: string | undefined;

      while (!requestSignal.aborted) {
        const statusResponse = await fetch(`/api/recipe-imports/${jobId}`, {
          cache: "no-store",
          signal: requestSignal,
        });
        const statusPayload: unknown = await statusResponse.json().catch(() => null);

        if (!isCurrent()) return;

        if (!statusResponse.ok) {
          setError(responseErrorMessage(statusPayload));
          return;
        }

        const parsedStatus = jobStatusResponseSchema.safeParse(statusPayload);
        if (!parsedStatus.success) {
          setError("The import status was incomplete. Please try again.");
          return;
        }

        const job = parsedStatus.data;

        if (job.id !== jobId) {
          setError("The import status was incomplete. Please try again.");
          return;
        }

        setStage(job.stage);

        if (job.status !== previousStatus) {
          console.info("[recipe-import-ui] job status changed", {
            jobId,
            status: job.status,
          });
          previousStatus = job.status;
        }

        if (job.status === "succeeded") {
          activeJobIdRef.current = null;
          const parsedDraft = parseDraft(job.draft);
          if (!parsedDraft) {
            setError("The imported recipe was incomplete. Please try again.");
            return;
          }

          setDraft(parsedDraft);
          setDraftJobId(jobId);
          setStep("review");
          requestAnimationFrame(() => {
            dialogRef.current
              ?.querySelector<HTMLInputElement>("#recipe-name")
              ?.focus();
          });
          return;
        }

        if (job.status === "failed" || job.status === "canceled") {
          activeJobIdRef.current = null;
          console.error("[recipe-import-ui] job ended without a result", {
            jobId,
            status: job.status,
            errorCode: job.error?.code,
            errorMessage: job.error?.message,
          });
          setError(job.status === "canceled"
            ? "The recipe import was canceled."
            : job.error?.message ?? "The recipe import failed. Please try again.");
          return;
        }

        await waitForNextPoll(requestSignal);
      }
    } catch (requestError) {
      if (!isCurrent()) return;
      if (deadlineSignal.aborted) {
        console.error("[recipe-import-ui] polling timed out", {
          timeoutMs: importTimeoutMs,
        });
        const jobId = activeJobIdRef.current;
        activeJobIdRef.current = null;
        if (jobId) void cancelJob(jobId);
        setError(`Recipe import timed out after ${importTimeoutMs / 1000} seconds. Please try again.`);
      } else if (!controller.signal.aborted) {
        console.error("[recipe-import-ui] request failed", {
          error: requestError instanceof Error
            ? requestError.message
            : String(requestError),
        });
        setError("Unable to reach the server. Please try again.");
      }
    } finally {
      if (isCurrent() && activeJobIdRef.current) {
        const jobId = activeJobIdRef.current;
        activeJobIdRef.current = null;
        void cancelJob(jobId);
      }
      if (isCurrent() && requestAbortRef.current === controller) {
        requestAbortRef.current = null;
      }
      if (isCurrent()) {
        parsingRef.current = false;
        setIsParsing(false);
        setStage(null);
      }
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

  function returnToDraft() {
    if (!draft || isBusy()) return;
    setStep("review");
    setError(null);
    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLInputElement>("#recipe-name")
        ?.focus();
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
          event.preventDefault();
          closeDialog();
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
              disabled={isSaving}
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
                  {importMode === "url"
                    ? "We read the recipe page and may use Firecrawl and Google Gemini if needed. Review the draft before saving."
                    : "Recipe sources are sent to Google Gemini for conversion. Review the draft before saving."}
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
                  {stage ?? "Converting recipe..."}
                </p>
              ) : null}

              <button
                className="min-h-11 rounded-xl bg-[#35644f] px-5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(53,100,79,0.16)] transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isParsing}
                type="submit"
              >
                {isParsing ? "Converting..." : "Review recipe"}
              </button>
              {draft ? (
                <button
                  className="ml-3 min-h-11 rounded-xl border border-[#ded9cf] bg-white px-4 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isParsing}
                  onClick={returnToDraft}
                  type="button"
                >
                  Return to edited draft
                </button>
              ) : null}
            </form>
          ) : null}

          {draft ? (
            <div className="space-y-6" hidden={step !== "review"}>
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
                key={draftJobId}
                onSubmittingChange={handleSavingChange}
                onSuccess={handleCreated}
              />
            </div>
          ) : null}

          <div className="mt-6 border-t border-[#e5e1d8] pt-4">
            <button
              className="rounded-lg border border-[#ded9cf] bg-white px-4 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
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
