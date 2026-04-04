import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import { requireAuth, requireRole } from "../plugins/authenticate.js";
import { createClientSchema, updateClientSchema } from "@content-factory/shared";

export async function clientRoutes(app: FastifyInstance) {
  // List all clients — authenticated users see active clients; admins see all
  app.get(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const isAdmin = request.user!.role === "admin";
      const rows = await db
        .select({
          id: clients.id,
          name: clients.name,
          websiteUrl: clients.websiteUrl,
          niche: clients.niche,
          industry: clients.industry,
          contactInfo: clients.contactInfo,
          notes: clients.notes,
          active: clients.active,
          createdBy: clients.createdBy,
          createdAt: clients.createdAt,
          updatedAt: clients.updatedAt,
        })
        .from(clients)
        .where(isAdmin ? undefined : eq(clients.active, true))
        .orderBy(desc(clients.createdAt));

      return reply.send({ clients: rows });
    }
  );

  // Create client — admin only
  app.post(
    "/",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const parsed = createClientSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { name, websiteUrl, niche, industry, contactInfo, notes } = parsed.data;

      const [client] = await db
        .insert(clients)
        .values({
          name,
          websiteUrl,
          niche,
          industry,
          contactInfo,
          notes,
          createdBy: request.user!.userId,
        })
        .returning({
          id: clients.id,
          name: clients.name,
          websiteUrl: clients.websiteUrl,
          niche: clients.niche,
          industry: clients.industry,
          contactInfo: clients.contactInfo,
          notes: clients.notes,
          active: clients.active,
          createdBy: clients.createdBy,
          createdAt: clients.createdAt,
          updatedAt: clients.updatedAt,
        });

      return reply.status(201).send({ client });
    }
  );

  // Get single client — authenticated; non-admins can only see active clients
  app.get(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const isAdmin = request.user!.role === "admin";

      const conditions = isAdmin
        ? eq(clients.id, id)
        : and(eq(clients.id, id), eq(clients.active, true));

      const [client] = await db
        .select({
          id: clients.id,
          name: clients.name,
          websiteUrl: clients.websiteUrl,
          niche: clients.niche,
          industry: clients.industry,
          contactInfo: clients.contactInfo,
          notes: clients.notes,
          active: clients.active,
          createdBy: clients.createdBy,
          createdAt: clients.createdAt,
          updatedAt: clients.updatedAt,
        })
        .from(clients)
        .where(conditions)
        .limit(1);

      if (!client) {
        return reply.status(404).send({ error: "Client not found" });
      }

      return reply.send({ client });
    }
  );

  // Update client — admin only
  app.patch(
    "/:id",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed = updateClientSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const { name, websiteUrl, niche, industry, contactInfo, notes, active } = parsed.data;
      if (name !== undefined) updates.name = name;
      if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl;
      if (niche !== undefined) updates.niche = niche;
      if (industry !== undefined) updates.industry = industry;
      if (contactInfo !== undefined) updates.contactInfo = contactInfo;
      if (notes !== undefined) updates.notes = notes;
      if (active !== undefined) updates.active = active;

      const [client] = await db
        .update(clients)
        .set(updates)
        .where(eq(clients.id, id))
        .returning({
          id: clients.id,
          name: clients.name,
          websiteUrl: clients.websiteUrl,
          niche: clients.niche,
          industry: clients.industry,
          contactInfo: clients.contactInfo,
          notes: clients.notes,
          active: clients.active,
          createdBy: clients.createdBy,
          createdAt: clients.createdAt,
          updatedAt: clients.updatedAt,
        });

      if (!client) {
        return reply.status(404).send({ error: "Client not found" });
      }

      return reply.send({ client });
    }
  );

  // Archive client (soft delete) — admin only
  app.delete(
    "/:id",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const rows = await db
        .update(clients)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(clients.id, id))
        .returning({ id: clients.id });

      if (rows.length === 0) {
        return reply.status(404).send({ error: "Client not found" });
      }

      return reply.status(204).send();
    }
  );
}
