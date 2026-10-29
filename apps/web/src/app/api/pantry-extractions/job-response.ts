import { AiJobStatus } from "@/generated/prisma/client";
import { pantryExtractionSchema } from "@/schemas/pantry-item";
import { getAiJobForUser } from "@/services/ai-job-service";

export function publicPantryImportJob(
  job: NonNullable<Awaited<ReturnType<typeof getAiJobForUser>>>,
) {
  const knownStages = new Set([
    "queued",
    "acquiring_source",
    "normalizing",
    "validating",
    "complete",
  ]);
  const stage =
    job.status === AiJobStatus.SUCCEEDED
      ? "complete"
      : knownStages.has(job.progressMessage)
        ? job.progressMessage
        : job.status === AiJobStatus.QUEUED
          ? "queued"
          : "normalizing";
  const parsedDraft = pantryExtractionSchema.safeParse(job.resultJson);
  return {
    id: job.id,
    status:
      job.status === AiJobStatus.RETRYING
        ? "processing"
        : job.status.toLowerCase(),
    sourceType: "image",
    stage,
    draft:
      job.status === AiJobStatus.SUCCEEDED && parsedDraft.success
        ? parsedDraft.data
        : null,
    error:
      job.status === AiJobStatus.FAILED
        ? { code: job.errorCode, message: job.errorMessage }
        : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    expiresAt: job.expiresAt.toISOString(),
  };
}
