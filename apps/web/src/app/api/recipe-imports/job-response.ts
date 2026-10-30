import { AiJobStatus } from "@/generated/prisma/client";
import { getAiJobForUser } from "@/services/ai-job-service";
import { z } from "zod";
import { recipeInputSchema } from "@/schemas/recipe";

const resultSchema = z.object({
  draft: recipeInputSchema,
  imageCandidate: z.union([
    z.object({ kind: z.literal("source_url"), url: z.url() }),
    z.object({ kind: z.literal("source_upload") }),
  ]).nullable(),
});

export function publicRecipeImportJob(
  job: NonNullable<Awaited<ReturnType<typeof getAiJobForUser>>>,
) {
  const result = job.status === AiJobStatus.SUCCEEDED
    ? resultSchema.safeParse(job.resultJson)
    : null;
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
    draft: result?.success ? result.data.draft : job.status === AiJobStatus.SUCCEEDED ? job.resultJson : null,
    imageCandidate: result?.success ? result.data.imageCandidate : null,
    error:
      job.status === AiJobStatus.FAILED
        ? { code: job.errorCode, message: job.errorMessage }
        : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    expiresAt: job.expiresAt.toISOString(),
  };
}
