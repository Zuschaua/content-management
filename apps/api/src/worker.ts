import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { eq } from "drizzle-orm";
import { processAnalyzeWebsiteJob } from "./jobs/analyze-website.js";
import { processAnalyzeCompetitorsJob } from "./jobs/analyze-competitors.js";
import { processTrackBlogJob } from "./jobs/track-blog.js";
import { processSuggestArticlesJob } from "./jobs/suggest-articles.js";
import { processWriteArticleJob } from "./jobs/write-article.js";
import { processRewriteSectionJob } from "./jobs/rewrite-section.js";
import { db } from "./db/index.js";
import { agentJobs } from "./db/schema.js";
import { verifyJobSignature } from "./lib/crypto.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

// Dead letter queue for permanently failed jobs
const dlqConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const deadLetterQueue = new Queue("agent-jobs-dlq", { connection: dlqConnection });

const agentWorker = new Worker(
  "agent-jobs",
  async (job) => {
    console.log(`Processing job ${job.id}: ${job.name}`);

    // Verify HMAC signature on job payload
    const { _sig, ...payload } = job.data;
    if (!_sig || !verifyJobSignature(payload, _sig)) {
      throw new Error(`Job ${job.id} has invalid or missing signature — rejecting`);
    }

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

      case "write-article":
        await processWriteArticleJob(job as Parameters<typeof processWriteArticleJob>[0]);
        break;

      case "rewrite-section":
        await processRewriteSectionJob(job as Parameters<typeof processRewriteSectionJob>[0]);
        break;

      // Remaining agents (M12) — to be implemented
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

agentWorker.on("failed", async (job, err) => {
  if (!job) return;
  const maxAttempts = job.opts.attempts ?? 1;
  console.error(`Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}):`, err.message);

  if (!job.data.agentJobId) return;

  if (job.attemptsMade < maxAttempts) {
    // D2 fix: update DB on intermediate failures so UI reflects retry state
    await db
      .update(agentJobs)
      .set({
        status: "queued",
        progress: 0,
        errorMessage: `Attempt ${job.attemptsMade}/${maxAttempts} failed: ${err.message}. Retrying…`,
        updatedAt: new Date(),
      })
      .where(eq(agentJobs.id, job.data.agentJobId));
  } else {
    console.error(`Job ${job.id} permanently failed after ${job.attemptsMade} attempts — moving to DLQ`);
    await deadLetterQueue.add(job.name, {
      originalJobId: job.id,
      agentJobId: job.data.agentJobId,
      clientId: job.data.clientId,
      error: err.message,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade,
    });

    // D3 fix: only overwrite status if the job hasn't already been cancelled
    const [current] = await db
      .select({ status: agentJobs.status })
      .from(agentJobs)
      .where(eq(agentJobs.id, job.data.agentJobId))
      .limit(1);

    if (current && current.status !== "cancelled") {
      await db
        .update(agentJobs)
        .set({
          status: "failed",
          errorMessage: `Permanently failed after ${job.attemptsMade} attempts: ${err.message}`,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentJobs.id, job.data.agentJobId));
    }
  }
});

console.log("Worker started, waiting for jobs...");
