import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processAnalyzeWebsiteJob } from "./jobs/analyze-website.js";
import { processAnalyzeCompetitorsJob } from "./jobs/analyze-competitors.js";
import { processTrackBlogJob } from "./jobs/track-blog.js";
import { processSuggestArticlesJob } from "./jobs/suggest-articles.js";

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

      case "analyze-competitors":
        await processAnalyzeCompetitorsJob(job as Parameters<typeof processAnalyzeCompetitorsJob>[0]);
        break;

      case "track-blog":
        await processTrackBlogJob(job as Parameters<typeof processTrackBlogJob>[0]);
        break;

      case "suggest-articles":
        await processSuggestArticlesJob(job as Parameters<typeof processSuggestArticlesJob>[0]);
        break;

      // Remaining agents (M9, M12) — to be implemented
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
