import type { FastifyInstance } from "fastify";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { agentJobs, clients, articles, articleSections } from "../db/schema.js";
import { requireAuth } from "../plugins/authenticate.js";
import { signJobPayload } from "../lib/crypto.js";
import { getQueue } from "../lib/queue.js";

const clientIdParamsSchema = z.object({
  clientId: z.string().uuid("clientId must be a valid UUID"),
});

const jobParamsSchema = z.object({
  clientId: z.string().uuid("clientId must be a valid UUID"),
  jobId: z.string().uuid("jobId must be a valid UUID"),
});

export async function agentRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/clients/:clientId/agents/analyze-website
   *
   * Enqueues a website analysis job for the given client.
   * Returns the agentJobId which can be used to stream progress.
   */
  app.post<{ Params: { clientId: string } }>(
    "/:clientId/agents/analyze-website",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = clientIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId } = paramsParsed.data;

      // Verify client exists
      const clientRows = await db
        .select({ id: clients.id, active: clients.active })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (clientRows.length === 0) {
        return reply.status(404).send({ error: "Client not found" });
      }
      if (!clientRows[0].active) {
        return reply.status(409).send({ error: "Client is archived" });
      }

      // Create the agentJobs record (queued state)
      const [agentJob] = await db
        .insert(agentJobs)
        .values({
          clientId,
          agentType: "website_analyzer",
          jobType: "analyze-website",
          status: "queued",
          progress: 0,
          inputData: { triggeredBy: request.user!.userId },
        })
        .returning({ id: agentJobs.id });

      // Enqueue the BullMQ job
      const analyzeJobData = { agentJobId: agentJob.id, clientId };
      await getQueue().add(
        "analyze-website",
        { ...analyzeJobData, _sig: signJobPayload(analyzeJobData) },
        {
          jobId: agentJob.id, // Use DB id as BullMQ job id for easy correlation
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }
      );

      return reply.status(202).send({
        agentJobId: agentJob.id,
        message: "Website analysis job queued",
      });
    }
  );

  /**
   * POST /api/v1/clients/:clientId/agents/track-blog
   *
   * Enqueues a blog content tracking job for the given client.
   * Crawls the client's website to discover and index existing blog posts.
   */
  app.post<{ Params: { clientId: string } }>(
    "/:clientId/agents/track-blog",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = clientIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId } = paramsParsed.data;

      // Verify client exists and has a website URL
      const clientRows = await db
        .select({ id: clients.id, active: clients.active, websiteUrl: clients.websiteUrl })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (clientRows.length === 0) {
        return reply.status(404).send({ error: "Client not found" });
      }
      if (!clientRows[0].active) {
        return reply.status(409).send({ error: "Client is archived" });
      }
      if (!clientRows[0].websiteUrl) {
        return reply.status(422).send({ error: "Client has no website URL — set one before running blog tracking" });
      }

      // Create the agentJobs record (queued state)
      const [agentJob] = await db
        .insert(agentJobs)
        .values({
          clientId,
          agentType: "blog_tracker",
          jobType: "track-blog",
          status: "queued",
          progress: 0,
          inputData: { triggeredBy: request.user!.userId },
        })
        .returning({ id: agentJobs.id });

      // Enqueue the BullMQ job
      const trackJobData = { agentJobId: agentJob.id, clientId };
      await getQueue().add(
        "track-blog",
        { ...trackJobData, _sig: signJobPayload(trackJobData) },
        {
          jobId: agentJob.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }
      );

      return reply.status(202).send({
        agentJobId: agentJob.id,
        message: "Blog tracking job queued",
      });
    }
  );

  /**
   * POST /api/v1/clients/:clientId/agents/suggest-articles
   *
   * Enqueues an article suggestion job for the given client.
   * Generates AI-powered topic suggestions with deduplication against existing content.
   */
  app.post<{ Params: { clientId: string } }>(
    "/:clientId/agents/suggest-articles",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = clientIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId } = paramsParsed.data;

      const bodySchema = z.object({
        count: z.number().int().min(1).max(20).default(5),
        preferences: z.string().optional(),
      });
      const bodyParsed = bodySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({ error: bodyParsed.error.errors[0]?.message ?? "Invalid body" });
      }
      const { count, preferences } = bodyParsed.data;

      // Verify client exists
      const clientRows = await db
        .select({ id: clients.id, active: clients.active })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (clientRows.length === 0) {
        return reply.status(404).send({ error: "Client not found" });
      }
      if (!clientRows[0].active) {
        return reply.status(409).send({ error: "Client is archived" });
      }

      // Create the agentJobs record (queued state)
      const [agentJob] = await db
        .insert(agentJobs)
        .values({
          clientId,
          agentType: "suggestion_engine",
          jobType: "suggest-articles",
          status: "queued",
          progress: 0,
          inputData: { triggeredBy: request.user!.userId, count, preferences },
        })
        .returning({ id: agentJobs.id });

      // Enqueue the BullMQ job
      const suggestJobData = { agentJobId: agentJob.id, clientId, count, preferences };
      await getQueue().add(
        "suggest-articles",
        { ...suggestJobData, _sig: signJobPayload(suggestJobData) },
        {
          jobId: agentJob.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }
      );

      return reply.status(202).send({
        agentJobId: agentJob.id,
        message: "Article suggestion job queued",
      });
    }
  );

  /**
   * POST /api/v1/clients/:clientId/agents/write-article
   *
   * Enqueues an article writing job for the given client.
   * Accepts articles at "approved" or "writing" (retry) status.
   */
  app.post<{ Params: { clientId: string } }>(
    "/:clientId/agents/write-article",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = clientIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId } = paramsParsed.data;

      const bodySchema = z.object({
        articleId: z.string().uuid(),
      });
      const bodyParsed = bodySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({ error: bodyParsed.error.errors[0]?.message ?? "Invalid body" });
      }
      const { articleId } = bodyParsed.data;

      // Verify client exists and is active
      const clientRows = await db
        .select({ id: clients.id, active: clients.active })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (clientRows.length === 0) {
        return reply.status(404).send({ error: "Client not found" });
      }
      if (!clientRows[0].active) {
        return reply.status(409).send({ error: "Client is archived" });
      }

      // Verify article exists and belongs to this client
      const articleRows = await db
        .select({ id: articles.id, status: articles.status })
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .limit(1);

      if (articleRows.length === 0) {
        return reply.status(404).send({ error: "Article not found" });
      }

      const article = articleRows[0];

      // Validate status
      if (article.status !== "approved" && article.status !== "writing") {
        return reply.status(422).send({
          error: `Article status is "${article.status}" — must be "approved" or "writing" to start writing`,
        });
      }

      // Check for concurrent running job
      const runningJobs = await db
        .select({ id: agentJobs.id })
        .from(agentJobs)
        .where(
          and(
            eq(agentJobs.referenceId, articleId),
            eq(agentJobs.jobType, "write-article"),
            inArray(agentJobs.status, ["queued", "running"])
          )
        )
        .limit(1);

      if (runningJobs.length > 0) {
        return reply.status(409).send({ error: "A write job is already running for this article" });
      }

      // Create agentJob — unique partial index prevents TOCTOU race
      let agentJob: { id: string };
      try {
        [agentJob] = await db
          .insert(agentJobs)
          .values({
            clientId,
            agentType: "article_writer",
            jobType: "write-article",
            referenceId: articleId,
            referenceType: "article",
            status: "queued",
            progress: 0,
            inputData: { triggeredBy: request.user!.userId },
          })
          .returning({ id: agentJobs.id });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("agent_job_active_unique")) {
          return reply.status(409).send({ error: "A write job is already running for this article" });
        }
        throw err;
      }

      // Enqueue BullMQ job
      const writeJobData = { agentJobId: agentJob.id, clientId, articleId };
      await getQueue().add(
        "write-article",
        { ...writeJobData, _sig: signJobPayload(writeJobData) },
        {
          jobId: agentJob.id,
          attempts: 2,
          backoff: { type: "fixed", delay: 5000 },
        }
      );

      return reply.status(202).send({
        agentJobId: agentJob.id,
        message: "Article writing job queued",
      });
    }
  );

  /**
   * POST /api/v1/clients/:clientId/agents/rewrite-section
   *
   * Enqueues a section rewrite job for a specific article section.
   */
  app.post<{ Params: { clientId: string } }>(
    "/:clientId/agents/rewrite-section",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = clientIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId } = paramsParsed.data;

      const bodySchema = z.object({
        articleId: z.string().uuid(),
        sectionId: z.string().uuid(),
        instructions: z.string().optional(),
      });
      const bodyParsed = bodySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({ error: bodyParsed.error.errors[0]?.message ?? "Invalid body" });
      }
      const { articleId, sectionId, instructions } = bodyParsed.data;

      // Verify client exists and is active
      const clientRows = await db
        .select({ id: clients.id, active: clients.active })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (clientRows.length === 0) {
        return reply.status(404).send({ error: "Client not found" });
      }
      if (!clientRows[0].active) {
        return reply.status(409).send({ error: "Client is archived" });
      }

      // Verify article exists and belongs to this client
      const articleRows = await db
        .select({ id: articles.id, status: articles.status })
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .limit(1);

      if (articleRows.length === 0) {
        return reply.status(404).send({ error: "Article not found" });
      }

      const article = articleRows[0];

      // Validate status — rewrite allowed on writing, written, proofreading
      if (!["writing", "written", "proofreading"].includes(article.status!)) {
        return reply.status(422).send({
          error: `Article status is "${article.status}" — must be "writing", "written", or "proofreading" for section rewrite`,
        });
      }

      // Verify section exists and belongs to article
      const sectionRows = await db
        .select({ id: articleSections.id })
        .from(articleSections)
        .where(and(eq(articleSections.id, sectionId), eq(articleSections.articleId, articleId)))
        .limit(1);

      if (sectionRows.length === 0) {
        return reply.status(404).send({ error: "Section not found for this article" });
      }

      // Check for concurrent running rewrite job on same section
      const runningJobs = await db
        .select({ id: agentJobs.id })
        .from(agentJobs)
        .where(
          and(
            eq(agentJobs.referenceId, sectionId),
            eq(agentJobs.jobType, "rewrite-section"),
            inArray(agentJobs.status, ["queued", "running"])
          )
        )
        .limit(1);

      if (runningJobs.length > 0) {
        return reply.status(409).send({ error: "A rewrite job is already running for this section" });
      }

      // Create agentJob — unique partial index prevents TOCTOU race
      let agentJob: { id: string };
      try {
        [agentJob] = await db
          .insert(agentJobs)
          .values({
            clientId,
            agentType: "article_writer",
            jobType: "rewrite-section",
            referenceId: sectionId,
            referenceType: "article_section",
            status: "queued",
            progress: 0,
            inputData: { triggeredBy: request.user!.userId, instructions },
          })
          .returning({ id: agentJobs.id });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("agent_job_active_unique")) {
          return reply.status(409).send({ error: "A rewrite job is already running for this section" });
        }
        throw err;
      }

      // Enqueue BullMQ job
      const rewriteJobData = { agentJobId: agentJob.id, clientId, articleId, sectionId, instructions };
      await getQueue().add(
        "rewrite-section",
        { ...rewriteJobData, _sig: signJobPayload(rewriteJobData) },
        {
          jobId: agentJob.id,
          attempts: 2,
          backoff: { type: "fixed", delay: 5000 },
        }
      );

      return reply.status(202).send({
        agentJobId: agentJob.id,
        message: "Section rewrite job queued",
      });
    }
  );

  /**
   * GET /api/v1/clients/:clientId/agents/jobs/:jobId
   *
   * Returns the current status of an agent job.
   */
  app.get<{ Params: { clientId: string; jobId: string } }>(
    "/:clientId/agents/jobs/:jobId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = jobParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId, jobId } = paramsParsed.data;

      const rows = await db
        .select()
        .from(agentJobs)
        .where(eq(agentJobs.id, jobId))
        .limit(1);

      if (rows.length === 0) {
        return reply.status(404).send({ error: "Job not found" });
      }

      const job = rows[0];
      if (job.clientId !== clientId) {
        return reply.status(404).send({ error: "Job not found" });
      }

      return reply.send({ job });
    }
  );

  /**
   * GET /api/v1/clients/:clientId/agents/jobs/:jobId/progress
   *
   * SSE stream that emits progress events until the job is terminal (completed/failed/cancelled).
   * Event format: data: {"progress": 60, "status": "running", "message": "..."}\n\n
   */
  app.get<{ Params: { clientId: string; jobId: string } }>(
    "/:clientId/agents/jobs/:jobId/progress",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = jobParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId, jobId } = paramsParsed.data;

      // Validate job belongs to this client upfront
      const initial = await db
        .select({ id: agentJobs.id, clientId: agentJobs.clientId })
        .from(agentJobs)
        .where(eq(agentJobs.id, jobId))
        .limit(1);

      if (initial.length === 0 || initial[0].clientId !== clientId) {
        return reply.status(404).send({ error: "Job not found" });
      }

      // SSE headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
      const POLL_INTERVAL_MS = 750;

      const sendEvent = (data: Record<string, unknown>) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const poll = async () => {
        try {
          const rows = await db
            .select({
              status: agentJobs.status,
              progress: agentJobs.progress,
              errorMessage: agentJobs.errorMessage,
              outputData: agentJobs.outputData,
            })
            .from(agentJobs)
            .where(eq(agentJobs.id, jobId))
            .limit(1);

          if (rows.length === 0) {
            sendEvent({ type: "error", message: "Job record not found" });
            reply.raw.end();
            return;
          }

          const row = rows[0];
          sendEvent({
            type: "progress",
            status: row.status,
            progress: row.progress,
            ...(row.errorMessage ? { error: row.errorMessage } : {}),
            ...(row.outputData ? { output: row.outputData } : {}),
          });

          if (row.status && TERMINAL_STATUSES.has(row.status)) {
            sendEvent({ type: "done", status: row.status });
            reply.raw.end();
            return;
          }

          // Continue polling
          setTimeout(() => {
            if (!request.raw.destroyed) {
              poll().catch(() => reply.raw.end());
            }
          }, POLL_INTERVAL_MS);
        } catch {
          reply.raw.end();
        }
      };

      // Handle client disconnect
      request.raw.on("close", () => {
        reply.raw.end();
      });

      // Start polling
      await poll();
    }
  );

  /**
   * POST /api/v1/clients/:clientId/agents/jobs/:jobId/retry
   *
   * Manually retries a failed job. Creates a new BullMQ job with the same parameters.
   * Only works on jobs in "failed" status. Enforces clientId scope.
   */
  app.post<{ Params: { clientId: string; jobId: string } }>(
    "/:clientId/agents/jobs/:jobId/retry",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = jobParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId, jobId } = paramsParsed.data;

      const rows = await db
        .select()
        .from(agentJobs)
        .where(eq(agentJobs.id, jobId))
        .limit(1);

      if (rows.length === 0) {
        return reply.status(404).send({ error: "Job not found" });
      }

      const job = rows[0];
      if (job.clientId !== clientId) {
        return reply.status(404).send({ error: "Job not found" });
      }

      if (job.status !== "failed") {
        return reply.status(409).send({ error: `Cannot retry job in "${job.status}" status — only failed jobs can be retried` });
      }

      // Create a new job record for the retry
      const [retryJob] = await db
        .insert(agentJobs)
        .values({
          clientId: job.clientId,
          agentType: job.agentType,
          jobType: job.jobType,
          referenceId: job.referenceId,
          referenceType: job.referenceType,
          status: "queued",
          progress: 0,
          inputData: job.inputData,
        })
        .returning({ id: agentJobs.id });

      // Build job data from original input
      const retryJobData: Record<string, unknown> = {
        agentJobId: retryJob.id,
        clientId: job.clientId,
      };
      // Carry forward extra fields from the original inputData
      const input = job.inputData as Record<string, unknown> | null;
      if (input?.count !== undefined) retryJobData.count = input.count;
      if (input?.preferences !== undefined) retryJobData.preferences = input.preferences;

      await getQueue().add(
        job.jobType,
        { ...retryJobData, _sig: signJobPayload(retryJobData) },
        {
          jobId: retryJob.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        }
      );

      return reply.status(202).send({
        agentJobId: retryJob.id,
        originalJobId: jobId,
        message: "Job retry queued",
      });
    }
  );

  /**
   * POST /api/v1/clients/:clientId/agents/jobs/:jobId/cancel
   *
   * Cancels a queued or running job. Removes the BullMQ job and updates the DB record.
   * Enforces clientId scope.
   */
  app.post<{ Params: { clientId: string; jobId: string } }>(
    "/:clientId/agents/jobs/:jobId/cancel",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = jobParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId, jobId } = paramsParsed.data;

      const rows = await db
        .select()
        .from(agentJobs)
        .where(eq(agentJobs.id, jobId))
        .limit(1);

      if (rows.length === 0) {
        return reply.status(404).send({ error: "Job not found" });
      }

      const job = rows[0];
      if (job.clientId !== clientId) {
        return reply.status(404).send({ error: "Job not found" });
      }

      const cancellableStatuses = new Set(["queued", "running"]);
      if (!job.status || !cancellableStatuses.has(job.status)) {
        return reply.status(409).send({ error: `Cannot cancel job in "${job.status}" status` });
      }

      // D3 fix: update DB to cancelled FIRST to win any race with the
      // worker's failed handler (which now skips if status is already cancelled)
      await db
        .update(agentJobs)
        .set({
          status: "cancelled",
          errorMessage: "Cancelled by user",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentJobs.id, jobId));

      // Then remove/fail the BullMQ job
      const bullJob = await getQueue().getJob(jobId);
      if (bullJob) {
        const state = await bullJob.getState();
        if (state === "waiting" || state === "delayed") {
          await bullJob.remove();
        } else if (state === "active") {
          await bullJob.moveToFailed(new Error("Cancelled by user"), "0", true);
        }
      }

      return reply.send({ message: "Job cancelled", jobId });
    }
  );
}
