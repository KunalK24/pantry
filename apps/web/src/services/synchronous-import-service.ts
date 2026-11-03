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

async function withinDeadline<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort(new ImportDeadlineError());
      reject(new ImportDeadlineError());
    }, IMPORT_DEADLINE_MS);
  });
  try {
    const result = await Promise.race([run(controller.signal), deadline]);
    if (controller.signal.aborted) {
      throw new ImportDeadlineError();
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function importRecipeSynchronously(input: RecipeInputRequest, userId: string) {
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
    return { ...result, importJobId: job.id };
  });
}

export async function extractPantrySynchronously(input: PantryExtractionInput) {
  return withinDeadline(async (signal) => {
    const items = await extractPantryItems(input, { signal });
    if (signal.aborted) {
      throw new ImportDeadlineError();
    }
    return { items };
  });
}
