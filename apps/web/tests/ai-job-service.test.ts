import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, queue } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    aiJob: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
  },
  queue: { add: vi.fn(), getJob: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/ai-job-queue", () => ({ aiJobQueue: queue }));

import {
  ActiveImportLimitError,
  AiJobEnqueueError,
  cancelAiJobForUser,
  createAiJob,
  updateAiJobResult,
  updateAiJobStage,
} from "@/services/ai-job-service";

const id = "cm12345678901234567890123";
const userId = "cm22345678901234567890123";

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) =>
    callback(db),
  );
  db.$queryRaw.mockResolvedValue([{ id: userId }]);
  db.aiJob.count.mockResolvedValue(0);
  db.aiJob.updateMany.mockResolvedValue({ count: 1 });
  db.aiJob.deleteMany.mockResolvedValue({ count: 0 });
});

describe("recipe import job lifecycle", () => {
  it("rejects a fourth active import while holding the user row lock", async () => {
    db.aiJob.count.mockResolvedValue(3);
    await expect(
      createAiJob({
        jobType: "recipe_import",
        input: { type: "text", text: "Secret" },
        userId,
      }),
    ).rejects.toBeInstanceOf(ActiveImportLimitError);
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.aiJob.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId,
          type: "RECIPE_IMPORT",
          status: { in: ["QUEUED", "PROCESSING", "RETRYING"] },
        }),
      }),
    );
    expect(db.aiJob.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("clears stored input and reports queue failure when enqueue fails", async () => {
    db.aiJob.create.mockResolvedValue({ id });
    queue.add.mockRejectedValue(new Error("Redis unavailable"));
    await expect(
      createAiJob({
        jobType: "recipe_import",
        input: { type: "text", text: "Secret" },
        userId,
      }),
    ).rejects.toBeInstanceOf(AiJobEnqueueError);
    expect(db.aiJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id, status: { in: ["QUEUED"] } },
        data: expect.objectContaining({
          status: "FAILED",
          errorCode: "queue_unavailable",
          inputJson: expect.anything(),
        }),
      }),
    );
  });

  it("only writes a successful draft while the job is processing", async () => {
    const draft = {
      name: "Toast",
      instructions: "Toast bread.",
      ingredients: [{ name: "Bread", quantity: "2" }],
    };
    db.aiJob.updateMany.mockResolvedValue({ count: 0 });
    expect(await updateAiJobResult(draft, id)).toBe(false);
    expect(db.aiJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id, status: "PROCESSING" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          inputJson: expect.anything(),
        }),
      }),
    );
  });

  it("does not advance a canceled job stage", async () => {
    db.aiJob.updateMany.mockResolvedValue({ count: 0 });
    expect(await updateAiJobStage(id, "validating")).toBe(false);
    expect(db.aiJob.updateMany).toHaveBeenCalledWith({
      where: { id, status: "PROCESSING" },
      data: { progressMessage: "validating" },
    });
  });

  it("cancellation cannot change a completed job", async () => {
    db.aiJob.findFirst.mockResolvedValueOnce({ id, bullJobId: null });
    db.aiJob.findFirst.mockResolvedValueOnce({
      id,
      status: "SUCCEEDED",
      sourceType: "text",
      progressMessage: "Completed",
    });
    const result = await cancelAiJobForUser(id, userId);
    expect(result?.status).toBe("SUCCEEDED");
    expect(db.aiJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id,
          userId,
          type: "RECIPE_IMPORT",
          status: { in: ["QUEUED", "PROCESSING", "RETRYING"] },
        },
      }),
    );
  });
});

describe("pantry import job lifecycle", () => {
  const image = {
    type: "image" as const,
    image: { mimeType: "image/jpeg" as const, data: "aGVsbG8=" },
  };

  it("scopes the active limit and queue entry to pantry imports", async () => {
    db.aiJob.create.mockResolvedValue({ id });
    queue.add.mockResolvedValue({ id });
    await createAiJob({ jobType: "pantry_import", input: image, userId });
    expect(db.aiJob.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "PANTRY_IMPORT" }),
      }),
    );
    expect(db.aiJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "PANTRY_IMPORT",
        sourceType: "image",
        inputJson: image,
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      "pantry-import",
      { aiJobId: id },
      expect.objectContaining({ jobId: id }),
    );
  });

  it("persists an item draft and clears image input", async () => {
    const draft = { items: [{ name: "Carrots" }] };
    expect(await updateAiJobResult(draft, id)).toBe(true);
    expect(db.aiJob.updateMany).toHaveBeenCalledWith({
      where: { id, status: "PROCESSING" },
      data: expect.objectContaining({
        resultJson: draft,
        status: "SUCCEEDED",
        inputJson: expect.anything(),
      }),
    });
  });

  it("restricts cancellation to pantry jobs and clears image input", async () => {
    db.aiJob.findFirst.mockResolvedValueOnce({ id, bullJobId: null });
    db.aiJob.findFirst.mockResolvedValueOnce({ id, status: "CANCELED" });
    await cancelAiJobForUser(id, userId, "PANTRY_IMPORT");
    expect(db.aiJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "PANTRY_IMPORT" }),
      }),
    );
    expect(db.aiJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "PANTRY_IMPORT" }),
        data: expect.objectContaining({
          status: "CANCELED",
          inputJson: expect.anything(),
        }),
      }),
    );
  });
});
