import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

let agentQueue: Queue | null = null;

export function getQueue(): Queue {
  if (!agentQueue) {
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    agentQueue = new Queue("agent-jobs", { connection });
  }
  return agentQueue;
}
