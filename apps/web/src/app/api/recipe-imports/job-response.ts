import { AiJobStatus } from "@/generated/prisma/client";
import { getAiJobForUser } from "@/services/ai-job-service";

export function publicRecipeImportJob(
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
          : "acquiring_source";
  return {
    id: job.id,
    status:
      job.status === AiJobStatus.RETRYING
        ? "processing"
        : job.status.toLowerCase(),
    sourceType: job.sourceType,
    stage,
    draft: job.status === AiJobStatus.SUCCEEDED ? job.resultJson : null,
    error:
      job.status === AiJobStatus.FAILED
        ? { code: job.errorCode, message: job.errorMessage }
        : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    expiresAt: job.expiresAt.toISOString(),
  };
}
