import type { FastifyInstance } from "fastify";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  articles,
  articleVersions,
  articleSections,
  clients,
} from "../db/schema.js";
import { requireAuth } from "../plugins/authenticate.js";
import {
  createArticleSchema,
  updateArticleSchema,
  transitionArticleStatusSchema,
  createArticleSectionSchema,
  updateArticleSectionSchema,
  canTransition,
  articleStatusValues,
} from "@content-factory/shared";

export async function articleRoutes(app: FastifyInstance) {
  // GET /clients/:clientId/articles — list all articles for a client (optional ?status filter)
  app.get(
    "/:clientId/articles",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };
      const { status } = request.query as { status?: string };

      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!client) return reply.status(404).send({ error: "Client not found" });

      let rows;
      if (status && (articleStatusValues as readonly string[]).includes(status)) {
        rows = await db
          .select()
          .from(articles)
          .where(
            and(
              eq(articles.clientId, clientId),
              eq(articles.status, status as (typeof articleStatusValues)[number])
            )
          )
          .orderBy(desc(articles.updatedAt));
      } else {
        rows = await db
          .select()
          .from(articles)
          .where(eq(articles.clientId, clientId))
          .orderBy(desc(articles.updatedAt));
      }

      return reply.send({ articles: rows });
    }
  );

  // POST /clients/:clientId/articles — create article
  app.post(
    "/:clientId/articles",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };

      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!client) return reply.status(404).send({ error: "Client not found" });

      const parsed = createArticleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const [article] = await db
        .insert(articles)
        .values({
          clientId,
          ...parsed.data,
          status: "suggested",
        })
        .returning();

      return reply.status(201).send({ article });
    }
  );

  // GET /clients/:clientId/articles/:articleId — get article with sections
  app.get(
    "/:clientId/articles/:articleId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, articleId } = request.params as {
        clientId: string;
        articleId: string;
      };

      const [article] = await db
        .select()
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .limit(1);

      if (!article) return reply.status(404).send({ error: "Article not found" });

      const sections = await db
        .select()
        .from(articleSections)
        .where(eq(articleSections.articleId, articleId))
        .orderBy(asc(articleSections.sortOrder));

      return reply.send({ article, sections });
    }
  );

  // PATCH /clients/:clientId/articles/:articleId — update article metadata/body
  app.patch(
    "/:clientId/articles/:articleId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, articleId } = request.params as {
        clientId: string;
        articleId: string;
      };

      const parsed = updateArticleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const [current] = await db
        .select()
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .limit(1);

      if (!current) return reply.status(404).send({ error: "Article not found" });

      const { body, ...rest } = parsed.data;

      // Track body version when body changes
      if (body !== undefined && body !== current.body) {
        const [latestVersion] = await db
          .select({ version: articleVersions.version })
          .from(articleVersions)
          .where(eq(articleVersions.articleId, articleId))
          .orderBy(desc(articleVersions.version))
          .limit(1);

        const newVersion = (latestVersion?.version ?? 0) + 1;

        await db.insert(articleVersions).values({
          articleId,
          version: newVersion,
          body,
          changeSource: "human",
          changedBy: request.user!.userId,
        });
      }

      const [article] = await db
        .update(articles)
        .set({
          ...rest,
          ...(body !== undefined ? { body } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .returning();

      if (!article) return reply.status(404).send({ error: "Article not found" });

      return reply.send({ article });
    }
  );

  // DELETE /clients/:clientId/articles/:articleId
  app.delete(
    "/:clientId/articles/:articleId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, articleId } = request.params as {
        clientId: string;
        articleId: string;
      };

      const rows = await db
        .delete(articles)
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .returning({ id: articles.id });

      if (rows.length === 0) return reply.status(404).send({ error: "Article not found" });

      return reply.status(204).send();
    }
  );

  // POST /clients/:clientId/articles/:articleId/transition — state machine transition
  app.post(
    "/:clientId/articles/:articleId/transition",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, articleId } = request.params as {
        clientId: string;
        articleId: string;
      };

      const parsed = transitionArticleStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { status: toStatus } = parsed.data;

      const [current] = await db
        .select()
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .limit(1);

      if (!current) return reply.status(404).send({ error: "Article not found" });

      if (!canTransition(current.status, toStatus)) {
        return reply.status(422).send({
          error: `Invalid transition: ${current.status} → ${toStatus}`,
        });
      }

      const [article] = await db
        .update(articles)
        .set({ status: toStatus, updatedAt: new Date() })
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .returning();

      if (!article) return reply.status(404).send({ error: "Article not found" });

      return reply.send({ article });
    }
  );

  // GET /clients/:clientId/articles/:articleId/versions — version history
  app.get(
    "/:clientId/articles/:articleId/versions",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, articleId } = request.params as {
        clientId: string;
        articleId: string;
      };

      const [article] = await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .limit(1);

      if (!article) return reply.status(404).send({ error: "Article not found" });

      const versions = await db
        .select()
        .from(articleVersions)
        .where(eq(articleVersions.articleId, articleId))
        .orderBy(desc(articleVersions.version));

      return reply.send({ versions });
    }
  );

  // POST /clients/:clientId/articles/:articleId/sections — create section
  app.post(
    "/:clientId/articles/:articleId/sections",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, articleId } = request.params as {
        clientId: string;
        articleId: string;
      };

      const [article] = await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .limit(1);

      if (!article) return reply.status(404).send({ error: "Article not found" });

      const parsed = createArticleSectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const [section] = await db
        .insert(articleSections)
        .values({ articleId, ...parsed.data })
        .returning();

      return reply.status(201).send({ section });
    }
  );

  // PATCH /clients/:clientId/articles/:articleId/sections/:sectionId — update section
  app.patch(
    "/:clientId/articles/:articleId/sections/:sectionId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, articleId, sectionId } = request.params as {
        clientId: string;
        articleId: string;
        sectionId: string;
      };

      // Verify article belongs to client
      const [article] = await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .limit(1);

      if (!article) return reply.status(404).send({ error: "Article not found" });

      const parsed = updateArticleSectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const rows = await db
        .update(articleSections)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(
          and(
            eq(articleSections.id, sectionId),
            eq(articleSections.articleId, articleId)
          )
        )
        .returning();

      if (rows.length === 0) return reply.status(404).send({ error: "Section not found" });

      return reply.send({ section: rows[0] });
    }
  );

  // DELETE /clients/:clientId/articles/:articleId/sections/:sectionId
  app.delete(
    "/:clientId/articles/:articleId/sections/:sectionId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, articleId, sectionId } = request.params as {
        clientId: string;
        articleId: string;
        sectionId: string;
      };

      const [article] = await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
        .limit(1);

      if (!article) return reply.status(404).send({ error: "Article not found" });

      const rows = await db
        .delete(articleSections)
        .where(
          and(
            eq(articleSections.id, sectionId),
            eq(articleSections.articleId, articleId)
          )
        )
        .returning({ id: articleSections.id });

      if (rows.length === 0) return reply.status(404).send({ error: "Section not found" });

      return reply.status(204).send();
    }
  );
}
