import type { FastifyInstance } from "fastify";
import { eq, and, desc, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  knowledgeBaseSections,
  knowledgeBaseVersions,
  clients,
} from "../db/schema.js";
import { requireAuth } from "../plugins/authenticate.js";
import {
  createKbSectionSchema,
  updateKbSectionSchema,
  revertKbSectionSchema,
} from "@content-factory/shared";

export async function knowledgeBaseRoutes(app: FastifyInstance) {
  // GET /clients/:clientId/knowledge-base — list all sections for a client
  app.get(
    "/:clientId/knowledge-base",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };

      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!client) return reply.status(404).send({ error: "Client not found" });

      const sections = await db
        .select()
        .from(knowledgeBaseSections)
        .where(eq(knowledgeBaseSections.clientId, clientId))
        .orderBy(asc(knowledgeBaseSections.sortOrder), asc(knowledgeBaseSections.createdAt));

      return reply.send({ sections });
    }
  );

  // POST /clients/:clientId/knowledge-base — create a new section
  app.post(
    "/:clientId/knowledge-base",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };

      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!client) return reply.status(404).send({ error: "Client not found" });

      const parsed = createKbSectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { sectionType, title, content, sortOrder, sourceAgent } = parsed.data;

      const [section] = await db
        .insert(knowledgeBaseSections)
        .values({
          clientId,
          sectionType,
          title,
          content,
          sortOrder: sortOrder ?? 0,
          sourceAgent,
          version: 1,
        })
        .returning();

      // Record initial version
      await db.insert(knowledgeBaseVersions).values({
        sectionId: section.id,
        version: 1,
        content,
        changedBy: request.user!.userId,
        changeSource: "human",
      });

      return reply.status(201).send({ section });
    }
  );

  // GET /clients/:clientId/knowledge-base/:sectionId — get a single section
  app.get(
    "/:clientId/knowledge-base/:sectionId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, sectionId } = request.params as {
        clientId: string;
        sectionId: string;
      };

      const [section] = await db
        .select()
        .from(knowledgeBaseSections)
        .where(
          and(
            eq(knowledgeBaseSections.id, sectionId),
            eq(knowledgeBaseSections.clientId, clientId)
          )
        )
        .limit(1);

      if (!section) return reply.status(404).send({ error: "Section not found" });

      return reply.send({ section });
    }
  );

  // PATCH /clients/:clientId/knowledge-base/:sectionId — update a section
  app.patch(
    "/:clientId/knowledge-base/:sectionId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, sectionId } = request.params as {
        clientId: string;
        sectionId: string;
      };

      const parsed = updateKbSectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const [current] = await db
        .select()
        .from(knowledgeBaseSections)
        .where(
          and(
            eq(knowledgeBaseSections.id, sectionId),
            eq(knowledgeBaseSections.clientId, clientId)
          )
        )
        .limit(1);

      if (!current) return reply.status(404).send({ error: "Section not found" });

      const { title, content, sortOrder } = parsed.data;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (title !== undefined) updates.title = title;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;

      const contentChanged = content !== undefined && content !== current.content;
      if (contentChanged) {
        const newVersion = (current.version ?? 1) + 1;
        updates.content = content;
        updates.version = newVersion;

        await db.insert(knowledgeBaseVersions).values({
          sectionId,
          version: newVersion,
          content: content!,
          changedBy: request.user!.userId,
          changeSource: "human",
        });
      }

      const [section] = await db
        .update(knowledgeBaseSections)
        .set(updates)
        .where(eq(knowledgeBaseSections.id, sectionId))
        .returning();

      return reply.send({ section });
    }
  );

  // DELETE /clients/:clientId/knowledge-base/:sectionId — delete a section
  app.delete(
    "/:clientId/knowledge-base/:sectionId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, sectionId } = request.params as {
        clientId: string;
        sectionId: string;
      };

      const rows = await db
        .delete(knowledgeBaseSections)
        .where(
          and(
            eq(knowledgeBaseSections.id, sectionId),
            eq(knowledgeBaseSections.clientId, clientId)
          )
        )
        .returning({ id: knowledgeBaseSections.id });

      if (rows.length === 0) return reply.status(404).send({ error: "Section not found" });

      return reply.status(204).send();
    }
  );

  // GET /clients/:clientId/knowledge-base/:sectionId/versions — list version history
  app.get(
    "/:clientId/knowledge-base/:sectionId/versions",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, sectionId } = request.params as {
        clientId: string;
        sectionId: string;
      };

      // Verify section belongs to client
      const [section] = await db
        .select({ id: knowledgeBaseSections.id })
        .from(knowledgeBaseSections)
        .where(
          and(
            eq(knowledgeBaseSections.id, sectionId),
            eq(knowledgeBaseSections.clientId, clientId)
          )
        )
        .limit(1);

      if (!section) return reply.status(404).send({ error: "Section not found" });

      const versions = await db
        .select()
        .from(knowledgeBaseVersions)
        .where(eq(knowledgeBaseVersions.sectionId, sectionId))
        .orderBy(desc(knowledgeBaseVersions.version));

      return reply.send({ versions });
    }
  );

  // POST /clients/:clientId/knowledge-base/:sectionId/revert — revert to a previous version
  app.post(
    "/:clientId/knowledge-base/:sectionId/revert",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId, sectionId } = request.params as {
        clientId: string;
        sectionId: string;
      };

      const parsed = revertKbSectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { version: targetVersion } = parsed.data;

      const [current] = await db
        .select()
        .from(knowledgeBaseSections)
        .where(
          and(
            eq(knowledgeBaseSections.id, sectionId),
            eq(knowledgeBaseSections.clientId, clientId)
          )
        )
        .limit(1);

      if (!current) return reply.status(404).send({ error: "Section not found" });

      const [targetVersionRow] = await db
        .select()
        .from(knowledgeBaseVersions)
        .where(
          and(
            eq(knowledgeBaseVersions.sectionId, sectionId),
            eq(knowledgeBaseVersions.version, targetVersion)
          )
        )
        .limit(1);

      if (!targetVersionRow) {
        return reply.status(404).send({ error: "Version not found" });
      }

      const newVersion = (current.version ?? 1) + 1;

      await db.insert(knowledgeBaseVersions).values({
        sectionId,
        version: newVersion,
        content: targetVersionRow.content,
        changedBy: request.user!.userId,
        changeSource: "human",
      });

      const [section] = await db
        .update(knowledgeBaseSections)
        .set({
          content: targetVersionRow.content,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeBaseSections.id, sectionId))
        .returning();

      return reply.send({ section });
    }
  );
}
