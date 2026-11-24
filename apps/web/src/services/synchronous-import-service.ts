import { AiJobStatus, AiJobType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { PantryExtractionInput } from "@/schemas/pantry-item";
import type { RecipeInputRequest } from "@/schemas/recipe";
import { extractPantryItems } from "@/services/pantry-extraction-service";
import { importRecipe } from "@/services/recipe-import-service";

const IMPORT_DEADLINE_MS = 90_000;
const IMAGE_PROVENANCE_TTL_MS = 24 * 60 * 60 * 1000;

export class ImportDeadlineError extends Error {
  constructor() {
    super("Import timed out");
    this.name = "ImportDeadlineError";
  }
}

async function withinDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  requestSignal?: AbortSignal,
): Promise<T> {
  if (requestSignal?.aborted) {
    throw new ImportDeadlineError();
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAborted: (error: ImportDeadlineError) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = reject;
    timer = setTimeout(() => {
      abortImport();
    }, IMPORT_DEADLINE_MS);
  });
  function abortImport() {
    const error = new ImportDeadlineError();
    controller.abort(error);
    rejectAborted(error);
  }
  requestSignal?.addEventListener("abort", abortImport, { once: true });
  try {
    const result = await Promise.race([run(controller.signal), aborted]);
    if (controller.signal.aborted) {
      throw new ImportDeadlineError();
    }
    return result;
  } finally {
    clearTimeout(timer);
    requestSignal?.removeEventListener("abort", abortImport);
  }
}

export async function importRecipeSynchronously(
  input: RecipeInputRequest,
  userId: string,
  requestSignal?: AbortSignal,
) {
  return withinDeadline(async (signal) => {
    const result = await importRecipe(input, { signal });
    if (signal.aborted) {
      throw new ImportDeadlineError();
    }
    if (result.imageCandidate?.kind !== "source_url") {
      return { ...result, importJobId: null };
    }
    // The image endpoint requires a completed, user-owned import as provenance.
    // Persist only the validated result, never the source image or other input.
    const job = await prisma.aiJob.create({
      data: {
        type: AiJobType.RECIPE_IMPORT,
        status: AiJobStatus.SUCCEEDED,
        sourceType: input.type,
        progressMessage: "complete",
        resultJson: result,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + IMAGE_PROVENANCE_TTL_MS),
        userId,
      },
      select: { id: true },
    });
    if (signal.aborted) {
      throw new ImportDeadlineError();
    }
    try {
      await prisma.$executeRaw`
        DELETE FROM "AiJob"
        WHERE "id" IN (
          SELECT "id" FROM "AiJob"
          WHERE "status" = 'SUCCEEDED' AND "expiresAt" < CURRENT_TIMESTAMP
          ORDER BY "expiresAt"
          LIMIT 100
        )
      `;
    } catch (error) {
      console.error("Expired import image provenance cleanup failed", error);
    }
    return { ...result, importJobId: job.id };
  }, requestSignal);
}

export async function extractPantrySynchronously(
  input: PantryExtractionInput,
  requestSignal?: AbortSignal,
) {
  return withinDeadline(async (signal) => {
    const items = await extractPantryItems(input, { signal });
    if (signal.aborted) {
      throw new ImportDeadlineError();
    }
    return { items };
  }, requestSignal);
}
