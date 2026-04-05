import { FastifyInstance } from "fastify";
import { sql, eq, and, count, max, desc, gte } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clients,
  articles,
  agentJobs,
  knowledgeBaseSections,
} from "../db/schema.js";
import { requireAuth } from "../plugins/authenticate.js";
import type {
  DashboardStatsResponse,
  PipelineStats,
  ActivityEvent,
  JobStatus,
  ClientOverview,
} from "@content-factory/shared";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    "/stats",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId } = request.query as { clientId?: string };

      // --- Query 1: Pipeline counts ---
      const statusFilter = clientId
        ? eq(articles.clientId, clientId)
        : undefined;

      const pipelineRows = await db
        .select({
          status: articles.status,
          count: count(),
        })
        .from(articles)
        .where(statusFilter)
        .groupBy(articles.status);

      const pipeline: PipelineStats = {
        suggested: 0,
        approved: 0,
        writing: 0,
        written: 0,
        proofreading: 0,
        ready: 0,
        total: 0,
      };
      for (const row of pipelineRows) {
        if (row.status && row.status in pipeline) {
          pipeline[row.status as keyof Omit<PipelineStats, "total">] =
            row.count;
        }
        pipeline.total += row.count;
      }

      const readyToExport = pipeline.ready;

      // --- Query 2: Active clients ---
      const [activeClientsRow] = await db
        .select({ count: count() })
        .from(clients)
        .where(eq(clients.active, true));
      const activeClients = activeClientsRow?.count ?? 0;

      // --- Query 3: Job status (last 24h) ---
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const jobFilter = clientId
        ? and(
            gte(agentJobs.createdAt, oneDayAgo),
            eq(agentJobs.clientId, clientId)
          )
        : gte(agentJobs.createdAt, oneDayAgo);

      const jobRows = await db
        .select({
          status: agentJobs.status,
          count: count(),
        })
        .from(agentJobs)
        .where(jobFilter)
        .groupBy(agentJobs.status);

      const jobStatus: JobStatus = {
        running: 0,
        queued: 0,
        failed: 0,
        completedToday: 0,
      };
      for (const row of jobRows) {
        if (row.status === "running") jobStatus.running = row.count;
        else if (row.status === "queued") jobStatus.queued = row.count;
        else if (row.status === "failed") jobStatus.failed = row.count;
        else if (row.status === "completed")
          jobStatus.completedToday = row.count;
      }

      // --- Query 4: Recent activity (last 20 events from agent_jobs) ---
      const activityFilter = clientId
        ? eq(agentJobs.clientId, clientId)
        : undefined;

      const recentJobs = await db
        .select({
          id: agentJobs.id,
          agentType: agentJobs.agentType,
          status: agentJobs.status,
          clientId: agentJobs.clientId,
          completedAt: agentJobs.completedAt,
          createdAt: agentJobs.createdAt,
        })
        .from(agentJobs)
        .where(activityFilter)
        .orderBy(desc(agentJobs.updatedAt))
        .limit(20);

      // Get client names for activity feed
      const clientIds = [
        ...new Set(recentJobs.map((j) => j.clientId)),
      ];
      const clientNameMap = new Map<string, string>();
      if (clientIds.length > 0) {
        const clientRows = await db
          .select({ id: clients.id, name: clients.name })
          .from(clients)
          .where(sql`${clients.id} = ANY(${clientIds})`);
        for (const c of clientRows) {
          clientNameMap.set(c.id, c.name);
        }
      }

      const recentActivity: ActivityEvent[] = recentJobs
        .filter((j) => j.status === "completed" || j.status === "failed")
        .map((j) => ({
          type: (j.status === "completed"
            ? "job_completed"
            : "job_failed") as ActivityEvent["type"],
          clientName: clientNameMap.get(j.clientId) ?? "Unknown",
          agentType: j.agentType,
          timestamp: (j.completedAt ?? j.createdAt)?.toISOString() ?? "",
        }));

      // Also include recently created articles
      const recentArticleFilter = clientId
        ? eq(articles.clientId, clientId)
        : undefined;

      const recentArticles = await db
        .select({
          id: articles.id,
          title: articles.title,
          clientId: articles.clientId,
          createdAt: articles.createdAt,
        })
        .from(articles)
        .where(recentArticleFilter)
        .orderBy(desc(articles.createdAt))
        .limit(10);

      // Fill client names for articles
      const articleClientIds = [
        ...new Set(recentArticles.map((a) => a.clientId)),
      ];
      for (const cId of articleClientIds) {
        if (!clientNameMap.has(cId)) {
          const [c] = await db
            .select({ id: clients.id, name: clients.name })
            .from(clients)
            .where(eq(clients.id, cId))
            .limit(1);
          if (c) clientNameMap.set(c.id, c.name);
        }
      }

      for (const a of recentArticles) {
        recentActivity.push({
          type: "article_created",
          articleId: a.id,
          articleTitle: a.title,
          clientName: clientNameMap.get(a.clientId) ?? "Unknown",
          timestamp: a.createdAt?.toISOString() ?? "",
        });
      }

      // Sort by timestamp descending and limit to 20
      recentActivity.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      recentActivity.splice(20);

      // --- Query 5: Client overviews (skip if scoped to single client) ---
      const clientOverviews: ClientOverview[] = [];
      if (!clientId) {
        const overviewRows = await db
          .select({
            id: clients.id,
            name: clients.name,
            articleCount: count(articles.id),
            readyCount:
              sql<number>`count(*) filter (where ${articles.status} = 'ready')`.as(
                "ready_count"
              ),
            inProgressCount:
              sql<number>`count(*) filter (where ${articles.status} in ('writing', 'proofreading'))`.as(
                "in_progress_count"
              ),
            lastActivityAt: max(articles.updatedAt),
          })
          .from(clients)
          .leftJoin(articles, eq(articles.clientId, clients.id))
          .where(eq(clients.active, true))
          .groupBy(clients.id, clients.name)
          .orderBy(desc(max(articles.updatedAt)));

        // Get KB section counts per client
        const kbCounts = await db
          .select({
            clientId: knowledgeBaseSections.clientId,
            count: count(),
          })
          .from(knowledgeBaseSections)
          .groupBy(knowledgeBaseSections.clientId);

        const kbCountMap = new Map<string, number>();
        for (const row of kbCounts) {
          kbCountMap.set(row.clientId, row.count);
        }

        for (const row of overviewRows) {
          clientOverviews.push({
            id: row.id,
            name: row.name,
            articleCount: row.articleCount,
            readyCount: Number(row.readyCount),
            inProgressCount: Number(row.inProgressCount),
            kbComplete: (kbCountMap.get(row.id) ?? 0) >= 3,
            lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
          });
        }
      }

      const response: DashboardStatsResponse = {
        pipeline,
        readyToExport,
        activeClients,
        recentActivity,
        jobStatus,
        clientOverviews,
      };

      return reply.send(response);
    }
  );
}
