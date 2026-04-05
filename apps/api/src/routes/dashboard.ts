import type { FastifyInstance } from "fastify";
import { eq, inArray, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients, articles } from "../db/schema.js";
import { requireAuth } from "../plugins/authenticate.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    "/stats",
    { preHandler: [requireAuth] },
    async (_request, reply) => {
      const [activeClientsResult, articlesInProgressResult, readyToExportResult] =
        await Promise.all([
          db
            .select({ count: count() })
            .from(clients)
            .where(eq(clients.active, true)),
          db
            .select({ count: count() })
            .from(articles)
            .where(
              inArray(articles.status, ["writing", "written", "proofreading"])
            ),
          db
            .select({ count: count() })
            .from(articles)
            .where(eq(articles.status, "ready")),
        ]);

      return reply.send({
        activeClients: activeClientsResult[0]?.count ?? 0,
        articlesInProgress: articlesInProgressResult[0]?.count ?? 0,
        readyToExport: readyToExportResult[0]?.count ?? 0,
      });
    }
  );
}
