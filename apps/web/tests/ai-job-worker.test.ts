import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type BullJob = {
  id: string;
  name: string;
  data: { aiJobId: string };
  attemptsMade: number;
};

const mocks = vi.hoisted(() => ({
  processor: null as null | ((job: BullJob) => Promise<unknown>),
  getAiJobById: vi.fn(),
  markAiJobProcessing: vi.fn(),
  isAiJobProcessing: vi.fn(),
  updateAiJobStage: vi.fn(),
  updateAiJobResult: vi.fn(),
  failAiJob: vi.fn(),
  reconcileStaleAiJobs: vi.fn(),
  extractPantryItems: vi.fn(),
  importRecipe: vi.fn(),
  watchJobCancellation: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(
      _name: string,
      processor: (job: BullJob) => Promise<unknown>,
    ) {
      mocks.processor = processor;
    }

    on() {
      return this;
    }
  },
}));
vi.mock("@/lib/redis", () => ({ redis: {} }));
vi.mock("@/lib/ai-job-queue", () => ({
  AI_JOB_QUEUE_NAME: "ai-job",
  aiJobQueue: {},
}));
vi.mock("@/services/ai-job-service", () => ({
  getAiJobById: mocks.getAiJobById,
  markAiJobProcessing: mocks.markAiJobProcessing,
  isAiJobProcessing: mocks.isAiJobProcessing,
  updateAiJobStage: mocks.updateAiJobStage,
  updateAiJobResult: mocks.updateAiJobResult,
  failAiJob: mocks.failAiJob,
  reconcileStaleAiJobs: mocks.reconcileStaleAiJobs,
}));
vi.mock("@/services/pantry-extraction-service", () => ({
  extractPantryItems: mocks.extractPantryItems,
  PantryImportError: class PantryImportError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  },
}));
vi.mock("@/services/recipe-import-service", () => ({
  importRecipe: mocks.importRecipe,
  RecipeImportError: class RecipeImportError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  },
}));
vi.mock("@/workers/job-cancellation", () => ({
  watchJobCancellation: mocks.watchJobCancellation,
}));

const id = "cm12345678901234567890123";
const image = {
  type: "image",
  image: {
    mimeType: "image/jpeg",
    data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64"),
  },
};
const bullJob: BullJob = {
  id,
  name: "pantry-import",
  data: { aiJobId: id },
  attemptsMade: 0,
};

beforeAll(async () => {
  mocks.reconcileStaleAiJobs.mockResolvedValue(undefined);
  const unusedInterval = setInterval(() => {}, 60_000);
  unusedInterval.unref();
  const interval = vi.spyOn(globalThis, "setInterval").mockReturnValue(unusedInterval);
  const processOnce = vi.spyOn(process, "once").mockImplementation(() => process);
  await import("@/workers/ai-job-worker");
  interval.mockRestore();
  processOnce.mockRestore();
  clearInterval(unusedInterval);
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAiJobById.mockResolvedValue({
    id,
    type: "PANTRY_IMPORT",
    inputJson: image,
  });
  mocks.markAiJobProcessing.mockResolvedValue(true);
  mocks.isAiJobProcessing.mockResolvedValue(true);
  mocks.updateAiJobStage.mockResolvedValue(true);
  mocks.updateAiJobResult.mockResolvedValue(true);
  mocks.failAiJob.mockResolvedValue(true);
  mocks.watchJobCancellation.mockReturnValue(vi.fn());
});

async function processJob(job = bullJob) {
  if (!mocks.processor) {
    throw new Error("Worker processor was not registered");
  }
  return mocks.processor(job);
}

describe("pantry import worker", () => {
  it("extracts image items and persists an items draft", async () => {
    const items = [{ name: "Carrots", quantity: "1", unit: "bag" }];
    mocks.extractPantryItems.mockResolvedValue(items);

    await expect(processJob()).resolves.toBe(true);

    expect(mocks.updateAiJobStage).toHaveBeenCalledWith(id, "normalizing");
    expect(mocks.extractPantryItems).toHaveBeenCalledWith(
      image,
      { signal: expect.any(AbortSignal) },
    );
    expect(mocks.updateAiJobResult).toHaveBeenCalledWith({ items }, id);
    expect(mocks.importRecipe).not.toHaveBeenCalled();
    expect(mocks.failAiJob).not.toHaveBeenCalled();
  });

  it("fails a job with invalid stored image input", async () => {
    mocks.getAiJobById.mockResolvedValue({
      id,
      type: "PANTRY_IMPORT",
      inputJson: { type: "text", text: "Carrots" },
    });

    await expect(processJob()).rejects.toThrow("Invalid stored pantry import input");
    expect(mocks.extractPantryItems).not.toHaveBeenCalled();
    expect(mocks.failAiJob).toHaveBeenCalledWith(id, {
      code: "worker_failure",
      message: "Pantry import failed",
      retryable: false,
    });
  });

  it("persists a retryable provider failure", async () => {
    const { PantryImportError } = await import(
      "@/services/pantry-extraction-service"
    );
    mocks.extractPantryItems.mockRejectedValue(new PantryImportError("rate_limited"));

    await expect(processJob()).rejects.toThrow("rate_limited");
    expect(mocks.updateAiJobResult).not.toHaveBeenCalled();
    expect(mocks.failAiJob).toHaveBeenCalledWith(id, {
      code: "rate_limited",
      message: "Pantry import failed",
      retryable: true,
    });
  });

  it("does not save or fail a job canceled while processing", async () => {
    mocks.watchJobCancellation.mockImplementation((controller: AbortController) => {
      controller.abort(new Error("Canceled"));
      return vi.fn();
    });
    mocks.isAiJobProcessing.mockResolvedValue(false);
    mocks.extractPantryItems.mockReturnValue(new Promise(() => {}));

    await expect(processJob()).resolves.toBeUndefined();
    expect(mocks.updateAiJobResult).not.toHaveBeenCalled();
    expect(mocks.failAiJob).not.toHaveBeenCalled();
  });
});
