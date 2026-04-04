import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processAnalyzeWebsiteJob } from "./jobs/analyze-website.js";
import { processTrackBlogJob } from "./jobs/track-blog.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const agentWorker = new Worker(
  "agent-jobs",
  async (job) => {
    console.log(`Processing job ${job.id}: ${job.name}`, job.data);

    switch (job.name) {
      case "analyze-website":
        await processAnalyzeWebsiteJob(job as Parameters<typeof processAnalyzeWebsiteJob>[0]);
        break;

      case "track-blog":
        await processTrackBlogJob(job as Parameters<typeof processTrackBlogJob>[0]);
        break;

      // Remaining agents (M4, M7, M9, M12) — to be implemented
      case "analyze-competitors":
      case "suggest-articles":
      case "write-article":
      case "rewrite-section":
      case "generate-images":
        console.log(`Agent job type: ${job.name} — not yet implemented`);
        break;

      default:
        console.warn(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 3,
  }
);

agentWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

agentWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Worker started, waiting for jobs...");
