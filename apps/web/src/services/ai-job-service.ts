import { AiJobStatus, AiJobType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { aiJobQueue } from "@/lib/ai-job-queue";
import { CreateAIJobInput } from "@/schemas/ai-job";
import type { RecipeInput } from "@/schemas/recipe";
import type { PantryExtraction } from "@/schemas/pantry-item";

const RETENTION_MS = 24 * 60 * 60 * 1000;
const STALE_MS = 3 * 60 * 1000;
const MAX_ACTIVE_IMPORTS = 3;
type Failure = { code: string; message: string; retryable: boolean };

export class AiJobEnqueueError extends Error {
  constructor() {
    super("Import queue is unavailable");
  }
}

export class ActiveImportLimitError extends Error {
  constructor() {
    super("Too many active imports");
  }
}

export async function createAiJob(
  input: CreateAIJobInput & { userId: string },
) {
  const type =
    input.jobType === "pantry_import"
      ? AiJobType.PANTRY_IMPORT
      : AiJobType.RECIPE_IMPORT;
  const job = await prisma.$transaction(async (tx) => {
    // Serialize concurrent creates for one user before checking the active-job count.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
    const active = await tx.aiJob.count({
      where: {
        userId: input.userId,
        type,
        status: {
          in: [
            AiJobStatus.QUEUED,
            AiJobStatus.PROCESSING,
            AiJobStatus.RETRYING,
          ],
        },
        updatedAt: { gt: new Date(Date.now() - STALE_MS) },
      },
    });
    if (active >= MAX_ACTIVE_IMPORTS) {
      throw new ActiveImportLimitError();
    }
    return tx.aiJob.create({
      data: {
        type,
        status: AiJobStatus.QUEUED,
        inputJson: input.input as Prisma.InputJsonValue,
        sourceType: input.input.type,
        progressMessage: "queued",
        expiresAt: new Date(Date.now() + RETENTION_MS),
        userId: input.userId,
      },
    });
  });
  let bullJob;
  try {
    bullJob = await aiJobQueue.add(
      input.jobType === "pantry_import" ? "pantry-import" : "recipe-import",
      { aiJobId: job.id },
      {
        jobId: job.id,
        attempts: 1,
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 3600, count: 1000 },
      },
    );
  } catch (error) {
    console.error("[ai-job] enqueue failed", { aiJobId: job.id, error });
    await failAiJob(
      job.id,
      {
        code: "queue_unavailable",
        message:
          type === AiJobType.PANTRY_IMPORT
            ? "Pantry import queue is unavailable"
            : "Recipe import queue is unavailable",
        retryable: true,
      },
      [AiJobStatus.QUEUED],
    );
    throw new AiJobEnqueueError();
  }
  try {
    await prisma.aiJob.updateMany({
      where: { id: job.id, status: AiJobStatus.QUEUED },
      data: { bullJobId: bullJob.id },
    });
  } catch (error) {
    // The queue has the job and can still process it; avoid reporting enqueue failure.
    console.error("[ai-job] could not save BullMQ ID", {
      aiJobId: job.id,
      error,
    });
  }
  return job;
}

export async function getAiJobById(jobId: string) {
  return prisma.aiJob.findUnique({ where: { id: jobId } });
}

export async function isAiJobProcessing(jobId: string) {
  const job = await prisma.aiJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  return job?.status === AiJobStatus.PROCESSING;
}

export async function getAiJobForUser(
  jobId: string,
  userId: string,
  type: AiJobType = AiJobType.RECIPE_IMPORT,
) {
  await reconcileStaleAiJobs(jobId, userId, type);
  return prisma.aiJob.findFirst({
    where: {
      id: jobId,
      userId,
      type,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      status: true,
      sourceType: true,
      progressMessage: true,
      resultJson: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
    },
  });
}

export async function markAiJobProcessing(jobId: string) {
  const result = await prisma.aiJob.updateMany({
    where: { id: jobId, status: AiJobStatus.QUEUED },
    data: {
      status: AiJobStatus.PROCESSING,
      progressMessage: "acquiring_source",
    },
  });
  return result.count === 1;
}

export async function updateAiJobStage(
  jobId: string,
  stage: "acquiring_source" | "normalizing" | "validating",
) {
  const result = await prisma.aiJob.updateMany({
    where: { id: jobId, status: AiJobStatus.PROCESSING },
    data: { progressMessage: stage },
  });
  return result.count === 1;
}

export async function failAiJob(
  jobId: string,
  failure: Failure,
  from: AiJobStatus[] = [AiJobStatus.PROCESSING],
) {
  const result = await prisma.aiJob.updateMany({
    where: { id: jobId, status: { in: from } },
    data: {
      status: AiJobStatus.FAILED,
      errorCode: failure.code,
      errorMessage: failure.message,
      errorRetryable: failure.retryable,
      inputJson: Prisma.DbNull,
      completedAt: new Date(),
    },
  });
  return result.count === 1;
}

export async function updateAiJobResult(
  input: RecipeInput | PantryExtraction,
  jobId: string,
) {
  const result = await prisma.aiJob.updateMany({
    where: { id: jobId, status: AiJobStatus.PROCESSING },
    data: {
      resultJson: input,
      status: AiJobStatus.SUCCEEDED,
      progressMessage: "complete",
      inputJson: Prisma.DbNull,
      completedAt: new Date(),
    },
  });
  return result.count === 1;
}

export async function cancelAiJobForUser(
  jobId: string,
  userId: string,
  type: AiJobType = AiJobType.RECIPE_IMPORT,
) {
  const existing = await prisma.aiJob.findFirst({
    where: {
      id: jobId,
      userId,
      type,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, bullJobId: true },
  });
  if (!existing) {
    return null;
  }
  await prisma.aiJob.updateMany({
    where: {
      id: jobId,
      userId,
      type,
      status: {
        in: [AiJobStatus.QUEUED, AiJobStatus.PROCESSING, AiJobStatus.RETRYING],
      },
    },
    data: {
      status: AiJobStatus.CANCELED,
      inputJson: Prisma.DbNull,
      canceledAt: new Date(),
      completedAt: new Date(),
    },
  });
  if (existing.bullJobId) {
    try {
      const queued = await aiJobQueue.getJob(existing.bullJobId);
      if (queued && (await queued.getState()) === "waiting") {
        await queued.remove();
      }
    } catch (error) {
      console.warn("[ai-job] could not remove canceled queue entry", {
        jobId,
        error,
      });
    }
  }
  return getAiJobForUser(jobId, userId, type);
}

export async function reconcileStaleAiJobs(
  jobId?: string,
  userId?: string,
  type: AiJobType = AiJobType.RECIPE_IMPORT,
) {
  const now = new Date();
  await prisma.aiJob.updateMany({
    where: {
      type,
      ...(jobId ? { id: jobId } : {}),
      ...(userId ? { userId } : {}),
      status: {
        in: [AiJobStatus.QUEUED, AiJobStatus.PROCESSING, AiJobStatus.RETRYING],
      },
      updatedAt: { lt: new Date(now.getTime() - STALE_MS) },
    },
    data: {
      status: AiJobStatus.FAILED,
      progressMessage: "Failed",
      errorCode: "stale_job",
      errorMessage:
        type === AiJobType.PANTRY_IMPORT
          ? "Pantry import did not complete in time"
          : "Recipe import did not complete in time",
      errorRetryable: true,
      inputJson: Prisma.DbNull,
      completedAt: now,
    },
  });
  if (jobId) {
    return;
  }
  await prisma.aiJob.deleteMany({
    where: {
      type,
      status: {
        in: [AiJobStatus.SUCCEEDED, AiJobStatus.FAILED, AiJobStatus.CANCELED],
      },
      expiresAt: { lt: now },
    },
  });
}
