import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

export const AI_JOB_QUEUE_NAME = "ai-job";

export const aiJobQueue = new Queue(AI_JOB_QUEUE_NAME, {
  connection: redis,
});
