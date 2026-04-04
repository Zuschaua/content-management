import type { FastifyInstance } from "fastify";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { competitors, agentJobs, clients } from "../db/schema.js";
import { requireAuth } from "../plugins/authenticate.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

let agentQueue: Queue | null = null;
function getQueue(): Queue {
  if (!agentQueue) {
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    agentQueue = new Queue("agent-jobs", { connection });
  }
  return agentQueue;
}

const clientIdParamsSchema = z.object({
  clientId: z.string().uuid("clientId must be a valid UUID"),
});

const competitorIdParamsSchema = z.object({
  clientId: z.string().uuid("clientId must be a valid UUID"),
  competitorId: z.string().uuid("competitorId must be a valid UUID"),
});

const createCompetitorBodySchema = z.object({
  websiteUrl: z.string().url("websiteUrl must be a valid URL"),
  name: z.string().max(255).optional(),
});

const updateCompetitorBodySchema = z.object({
  websiteUrl: z.string().url("websiteUrl must be a valid URL").optional(),
  name: z.string().max(255).optional(),
});

export async function competitorRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/clients/:clientId/competitors
   * List all competitors for a client.
   */
  app.get<{ Params: { clientId: string } }>(
    "/:clientId/competitors",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = clientIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId } = paramsParsed.data;

      const rows = await db
        .select()
        .from(competitors)
        .where(eq(competitors.clientId, clientId))
        .orderBy(competitors.createdAt);

      return reply.send({ competitors: rows });
    }
  );

  /**
   * POST /api/v1/clients/:clientId/competitors
   * Add a competitor for a client.
   */
  app.post<{ Params: { clientId: string } }>(
    "/:clientId/competitors",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = clientIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId } = paramsParsed.data;

      const bodyParsed = createCompetitorBodySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({ error: bodyParsed.error.errors[0]?.message ?? "Invalid body" });
      }
      const { websiteUrl, name } = bodyParsed.data;

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

      const [competitor] = await db
        .insert(competitors)
        .values({ clientId, websiteUrl, name: name ?? null })
        .returning();

      return reply.status(201).send({ competitor });
    }
  );

  /**
   * PATCH /api/v1/clients/:clientId/competitors/:competitorId
   * Update a competitor's details.
   */
  app.patch<{ Params: { clientId: string; competitorId: string } }>(
    "/:clientId/competitors/:competitorId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = competitorIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId, competitorId } = paramsParsed.data;

      const bodyParsed = updateCompetitorBodySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({ error: bodyParsed.error.errors[0]?.message ?? "Invalid body" });
      }
      const updates = bodyParsed.data;

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      const rows = await db
        .select({ id: competitors.id, clientId: competitors.clientId })
        .from(competitors)
        .where(and(eq(competitors.id, competitorId), eq(competitors.clientId, clientId)))
        .limit(1);

      if (rows.length === 0) {
        return reply.status(404).send({ error: "Competitor not found" });
      }

      const [updated] = await db
        .update(competitors)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(competitors.id, competitorId))
        .returning();

      return reply.send({ competitor: updated });
    }
  );

  /**
   * DELETE /api/v1/clients/:clientId/competitors/:competitorId
   * Remove a competitor.
   */
  app.delete<{ Params: { clientId: string; competitorId: string } }>(
    "/:clientId/competitors/:competitorId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paramsParsed = competitorIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: paramsParsed.error.errors[0]?.message ?? "Invalid params" });
      }
      const { clientId, competitorId } = paramsParsed.data;

      const rows = await db
        .select({ id: competitors.id })
        .from(competitors)
        .where(and(eq(competitors.id, competitorId), eq(competitors.clientId, clientId)))
        .limit(1);

      if (rows.length === 0) {
        return reply.status(404).send({ error: "Competitor not found" });
      }

      await db.delete(competitors).where(eq(competitors.id, competitorId));

      return reply.status(204).send();
    }
  );

  /**
   * POST /api/v1/clients/:clientId/agents/analyze-competitors
   * Enqueues a competitor analysis job for the given client.
   */
  app.post<{ Params: { clientId: string } }>(
    "/:clientId/agents/analyze-competitors",
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

      const [agentJob] = await db
        .insert(agentJobs)
        .values({
          clientId,
          agentType: "competitor_analyzer",
          jobType: "analyze-competitors",
          status: "queued",
          progress: 0,
          inputData: { triggeredBy: request.user!.userId },
        })
        .returning({ id: agentJobs.id });

      await getQueue().add(
        "analyze-competitors",
        { agentJobId: agentJob.id, clientId },
        {
          jobId: agentJob.id,
          attempts: 2,
          backoff: { type: "fixed", delay: 5000 },
        }
      );

      return reply.status(202).send({
        agentJobId: agentJob.id,
        message: "Competitor analysis job queued",
      });
    }
  );
}
