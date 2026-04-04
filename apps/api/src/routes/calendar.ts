import type { FastifyInstance } from "fastify";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { articles, clients } from "../db/schema.js";
import { requireAuth } from "../plugins/authenticate.js";

export async function calendarRoutes(app: FastifyInstance) {
  // GET /clients/:clientId/calendar?month=YYYY-MM
  // Returns all articles with scheduledDate within the given month
  app.get(
    "/:clientId/calendar",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };
      const { month } = request.query as { month?: string };

      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!client) return reply.status(404).send({ error: "Client not found" });

      const targetMonth = month ?? new Date().toISOString().slice(0, 7);

      if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
        return reply
          .status(400)
          .send({ error: "Invalid month format. Use YYYY-MM." });
      }

      const [year, monthNum] = targetMonth.split("-").map(Number);
      const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
      const lastDay = new Date(year, monthNum, 0).getDate();
      const endDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const rows = await db
        .select()
        .from(articles)
        .where(
          and(
            eq(articles.clientId, clientId),
            isNotNull(articles.scheduledDate),
            gte(articles.scheduledDate, startDate),
            lte(articles.scheduledDate, endDate)
          )
        )
        .orderBy(articles.scheduledDate);

      return reply.send({ articles: rows, month: targetMonth });
    }
  );
}
