"use client";

import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import { z } from "zod";

import { MAX_IMAGE_BYTES } from "@/lib/image-upload";
import { aiJobIdSchema } from "@/schemas/ai-job";
import { pantryExtractionSchema, pantryItemInputSchema } from "@/schemas/pantry-item";

type DraftRow = {
  id: number;
  name: string;
  quantity: string;
  unit: string;
  selected: boolean;
  error: string | null;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const TIMEOUT_MS = 300_000;
const jobSchema = z.object({
  id: aiJobIdSchema,
  status: z.enum(["queued", "processing", "retrying", "succeeded", "failed", "canceled"]),
  sourceType: z.literal("image"),
  stage: z.string().nullable(),
  draft: z.unknown(),
  error: z.object({ code: z.string().nullable(), message: z.string().nullable() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
});

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const data = typeof reader.result === "string" ? reader.result.split(",", 2)[1] : null;
      if (data) {resolve(data);}
      else {reject(new Error("Unable to read that image. Please choose another file."));}
    });
    reader.addEventListener("error", () => reject(new Error("Unable to read that image. Please choose another file.")));
    reader.readAsDataURL(file);
  });
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, 1500);
    function onAbort() {
      window.clearTimeout(timeout);
      reject(signal.reason);
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function cancelJob(id: string) {
  try {
    const response = await fetch(`/api/pantry-extractions/${id}/cancel`, { method: "POST" });
    if (!response.ok) {console.error("[pantry-import-ui] cancellation failed", { id, status: response.status });}
  } catch (error) {
    console.error("[pantry-import-ui] cancellation request failed", { id, error });
  }
}

export default function ExtractionPantryDialog({ onPantryItemsCreated }: { onPantryItemsCreated: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationRef = useRef(0);
  const activeJobRef = useRef<string | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const extractingRef = useRef(false);
  const savingRef = useRef(false);
  const [image, setImage] = useState<File | null>(null);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => () => {
    generationRef.current += 1;
    pollAbortRef.current?.abort();
    if (activeJobRef.current) {
      void cancelJob(activeJobRef.current);
      activeJobRef.current = null;
    }
  }, []);

  function openDialog() {
    generationRef.current += 1;
    extractingRef.current = false;
    savingRef.current = false;
    setIsExtracting(false);
    setIsSaving(false);
    setImage(null);
    setRows(null);
    setError(null);
    setNotice(null);
    setStage(null);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => fileInputRef.current?.focus());
  }

  function closeDialog() {
    if (savingRef.current) {return;}
    generationRef.current += 1;
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    if (activeJobRef.current) {
      void cancelJob(activeJobRef.current);
      activeJobRef.current = null;
    }
    extractingRef.current = false;
    setIsExtracting(false);
    setStage(null);
    dialogRef.current?.close();
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    setImage(event.target.files?.[0] ?? null);
    setError(null);
    setNotice(null);
  }

  async function handleExtract(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (extractingRef.current || savingRef.current) {return;}
    if (!image) {
      setError("Choose an image before continuing.");
      fileInputRef.current?.focus();
      return;
    }
    if (!IMAGE_TYPES.includes(image.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      fileInputRef.current?.focus();
      return;
    }
    if (image.size === 0 || image.size > MAX_IMAGE_BYTES) {
      setError(image.size === 0 ? "Choose an image that is not empty." : "Choose an image smaller than 5 MB.");
      fileInputRef.current?.focus();
      return;
    }

    const generation = ++generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    const controller = new AbortController();
    const deadline = AbortSignal.timeout(TIMEOUT_MS);
    const pollSignal = AbortSignal.any([controller.signal, deadline]);
    pollAbortRef.current = controller;
    extractingRef.current = true;
    setIsExtracting(true);
    setError(null);
    setNotice(null);
    setRows(null);
    setStage("Starting import...");

    try {
      const data = await readImage(image);
      if (!isCurrent()) {return;}
      // Keep creation alive after close so its returned job ID can be canceled.
      const response = await fetch("/api/pantry-extractions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "image", image: { mimeType: image.type, data } }),
        signal: deadline,
      });
      const payload: unknown = await response.json().catch(() => null);
      const parsedId = typeof payload === "object" && payload !== null && "id" in payload
        ? aiJobIdSchema.safeParse(payload.id) : null;
      const jobId = parsedId?.success ? parsedId.data : null;
      if (!isCurrent()) {
        if (response.ok && jobId) {void cancelJob(jobId);}
        return;
      }
      if (!response.ok) {
        setError(errorMessage(payload, "Unable to start the pantry import. Please try again."));
        return;
      }
      if (!jobId) {
        setError("The import could not be started. Please try again.");
        return;
      }
      activeJobRef.current = jobId;

      while (!pollSignal.aborted) {
        const statusResponse = await fetch(`/api/pantry-extractions/${jobId}`, {
          cache: "no-store",
          signal: pollSignal,
        });
        const statusPayload: unknown = await statusResponse.json().catch(() => null);
        if (!isCurrent()) {return;}
        if (!statusResponse.ok) {
          setError(errorMessage(statusPayload, "Unable to check the import. Please try again."));
          return;
        }
        const parsed = jobSchema.safeParse(statusPayload);
        if (!parsed.success || parsed.data.id !== jobId) {
          setError("The import status was incomplete. Please try again.");
          return;
        }
        const job = parsed.data;
        setStage(job.stage);
        if (job.status === "succeeded") {
          activeJobRef.current = null;
          const draft = pantryExtractionSchema.safeParse(job.draft);
          if (!draft.success) {
            setError("The extracted pantry items were incomplete. Please try again.");
            return;
          }
          setRows(draft.data.items.map((item, index) => ({
            id: index,
            name: item.name,
            quantity: item.quantity ?? "",
            unit: item.unit ?? "",
            selected: true,
            error: null,
          })));
          requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLInputElement>("#pantry-import-name-0")?.focus());
          return;
        }
        if (job.status === "failed" || job.status === "canceled") {
          activeJobRef.current = null;
          setError(job.status === "canceled" ? "The pantry import was canceled."
            : job.error?.message ?? "The pantry import failed. Please try again.");
          return;
        }
        await waitForPoll(pollSignal);
      }
    } catch (requestError) {
      if (!isCurrent()) {return;}
      if (deadline.aborted) {
        setError("Pantry import timed out after 5 minutes. Please try again.");
      }
      else if (!controller.signal.aborted) {
        setError(requestError instanceof Error && requestError.message.startsWith("Unable to read")
          ? requestError.message : "Unable to reach the server. Please try again.");
      }
    } finally {
      if (isCurrent() && activeJobRef.current) {
        void cancelJob(activeJobRef.current);
        activeJobRef.current = null;
      }
      if (isCurrent()) {
        pollAbortRef.current = null;
        extractingRef.current = false;
        setIsExtracting(false);
        setStage(null);
      }
    }
  }

  function updateRow(id: number, changes: Partial<DraftRow>) {
    setRows((current) => current?.map((row) => row.id === id
      ? { ...row, ...changes, error: null } : row) ?? null);
    setNotice(null);
  }

  async function handleSave() {
    if (!rows || savingRef.current || extractingRef.current) {return;}
    const selected = rows.filter((row) => row.selected);
    if (!selected.length) {
      setError("Select at least one item to save.");
      return;
    }
    const generation = generationRef.current;
    const validationErrors = new Map<number, string>();
    const validItems = selected.flatMap((row) => {
      const result = pantryItemInputSchema.safeParse({
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
      });
      if (!result.success) {
        validationErrors.set(row.id, "Enter a name (up to 200 characters); quantity and unit may be up to 100 characters.");
        return [];
      }
      return [{ id: row.id, item: result.data }];
    });
    if (validationErrors.size) {
      setRows((current) => current?.map((row) => ({
        ...row,
        error: validationErrors.get(row.id) ?? row.error,
      })) ?? null);
      setError("Correct the highlighted items before saving.");
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    const savedIds = new Set<number>();
    const saveErrors = new Map<number, string>();
    try {
      for (const { id, item } of validItems) {
        try {
          const response = await fetch("/api/pantry-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });
          if (response.ok) {savedIds.add(id);}
          else {
            const payload: unknown = await response.json().catch(() => null);
            saveErrors.set(id, response.status === 409
              ? "Already in your pantry. Edit or remove this item."
              : errorMessage(payload, "Unable to save this item. Please try again."));
          }
        } catch {
          saveErrors.set(id, "Unable to reach the server. Please try again.");
        }
      }
      if (generation !== generationRef.current) {return;}
      setRows((current) => current?.filter((row) => !savedIds.has(row.id)).map((row) => ({
        ...row,
        error: saveErrors.get(row.id) ?? row.error,
      })) ?? null);
      if (savedIds.size) {
        onPantryItemsCreated();
        setNotice(`${savedIds.size} ${savedIds.size === 1 ? "item" : "items"} added to your pantry.`);
      }
      if (saveErrors.size) {
        setError(`${saveErrors.size} ${saveErrors.size === 1 ? "item needs" : "items need"} attention.`);
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        className="inline-flex min-h-11 items-center rounded-xl border border-[#35644f] bg-white px-5 text-[0.9rem] font-bold text-[#35644f] hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        Import from image
      </button>
      <dialog
        aria-labelledby="pantry-import-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-[#ded9cf] bg-[#fbfaf6] p-0 text-[#24342b] shadow-[0_24px_60px_rgba(42,48,38,0.18)] backdrop:bg-[#24342b]/35"
        onCancel={(event) => { event.preventDefault(); closeDialog(); }}
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <div className="p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-4 border-b border-[#e5e1d8] pb-4">
              <h2 id="pantry-import-title" className="[font-family:Georgia,serif] text-2xl font-bold">Import pantry items</h2>
              <button aria-label="Close pantry import dialog" className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f] disabled:opacity-60" disabled={isSaving} onClick={closeDialog} type="button">Close</button>
            </div>
            {rows === null ? (
              <form onSubmit={handleExtract}>
                <p className="mb-4 text-sm leading-6 text-[#6f7a71]">Upload a photo of your groceries. Review the suggested items before adding them to your pantry.</p>
                <label className="block text-sm font-bold" htmlFor="pantry-import-image">Pantry image</label>
                <input accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full rounded-xl border border-[#d8d3c8] bg-white p-3 text-sm" disabled={isExtracting} id="pantry-import-image" onChange={handleImageChange} ref={fileInputRef} type="file" />
                <p className="mt-2 text-xs text-[#6f7a71]">JPEG, PNG, or WebP, up to 5 MB.</p>
                {isExtracting && <p aria-live="polite" className="mt-4 text-sm">{stage ?? "Reading image..."}</p>}
                {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
                <button className="mt-6 rounded-xl bg-[#35644f] px-5 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={isExtracting} type="submit">{isExtracting ? "Importing..." : "Review items"}</button>
              </form>
            ) : (
              <div>
                <p className="mb-4 text-sm leading-6 text-[#6f7a71]">Check each suggestion. Edit or remove items, then select the ones you want to add.</p>
                {rows.length === 0 && !notice && <p role="status" className="rounded-xl bg-white p-4 text-sm">No items found in this image. Choose another image to try again.</p>}
                <div className="space-y-3">
                  {rows.map((row) => (
                    <div className="rounded-xl border border-[#ded9cf] bg-white p-4" key={row.id}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm font-bold"><input checked={row.selected} disabled={isSaving} onChange={(event) => updateRow(row.id, { selected: event.target.checked })} type="checkbox" />Add item {row.id + 1}</label>
                        <button className="text-sm font-bold text-red-700 underline disabled:opacity-60" disabled={isSaving} onClick={() => setRows((current) => current?.filter((item) => item.id !== row.id) ?? null)} type="button">Remove</button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                        <label className="text-sm font-bold" htmlFor={`pantry-import-name-${row.id}`}>Name<input className="mt-1 w-full rounded-lg border border-[#d8d3c8] p-2 font-normal" disabled={isSaving} id={`pantry-import-name-${row.id}`} maxLength={200} onChange={(event) => updateRow(row.id, { name: event.target.value })} value={row.name} /></label>
                        <label className="text-sm font-bold" htmlFor={`pantry-import-quantity-${row.id}`}>Quantity<input className="mt-1 w-full rounded-lg border border-[#d8d3c8] p-2 font-normal" disabled={isSaving} id={`pantry-import-quantity-${row.id}`} maxLength={100} onChange={(event) => updateRow(row.id, { quantity: event.target.value })} value={row.quantity} /></label>
                        <label className="text-sm font-bold" htmlFor={`pantry-import-unit-${row.id}`}>Unit<input className="mt-1 w-full rounded-lg border border-[#d8d3c8] p-2 font-normal" disabled={isSaving} id={`pantry-import-unit-${row.id}`} maxLength={100} onChange={(event) => updateRow(row.id, { unit: event.target.value })} value={row.unit} /></label>
                      </div>
                      {row.error && <p role="alert" className="mt-2 text-sm text-red-700">{row.error}</p>}
                    </div>
                  ))}
                </div>
                {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
                {notice && <p role="status" className="mt-4 text-sm text-[#35644f]">{notice}</p>}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button className="rounded-xl border border-[#35644f] px-5 py-3 text-sm font-bold text-[#35644f] disabled:opacity-60" disabled={isSaving} onClick={() => { setRows(null); setImage(null); setError(null); setNotice(null); requestAnimationFrame(() => fileInputRef.current?.focus()); }} type="button">Choose another image</button>
                  <button className="rounded-xl bg-[#35644f] px-5 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={isSaving || rows.length === 0 || !rows.some((row) => row.selected)} onClick={() => void handleSave()} type="button">{isSaving ? "Saving..." : "Save selected items"}</button>
                </div>
              </div>
            )}
        </div>
      </dialog>
    </>
  );
}
