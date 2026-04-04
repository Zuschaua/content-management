import type { FastifyInstance } from "fastify";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { agentJobs, clients } from "../db/schema.js";
import { requireAuth } from "../plugins/authenticate.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const clientIdParamsSchema = z.object({
  clientId: z.string().uuid("clientId must be a valid UUID"),
});

const jobParamsSchema = z.object({
  clientId: z.string().uuid("clientId must be a valid UUID"),
  jobId: z.string().uuid("jobId must be a valid UUID"),
});

// Lazy-init the BullMQ queue (shared with worker)
let agentQueue: Queue | null = null;
function getQueue(): Queue {
  if (!agentQueue) {
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    agentQueue = new Queue("agent-jobs", { connection });
  }
  return agentQueue;
}

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
      await getQueue().add(
        "analyze-website",
        { agentJobId: agentJob.id, clientId },
        {
          jobId: agentJob.id, // Use DB id as BullMQ job id for easy correlation
          attempts: 2,
          backoff: { type: "fixed", delay: 5000 },
        }
      );

      return reply.status(202).send({
        agentJobId: agentJob.id,
        message: "Website analysis job queued",
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
}
