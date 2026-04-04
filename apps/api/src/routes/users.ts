import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { requireAuth, requireRole } from "../plugins/authenticate.js";
import { z } from "zod";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  role: z.enum(["admin", "editor", "writer"]).default("editor"),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.enum(["admin", "editor", "writer"]).optional(),
  password: z.string().min(8).max(128).optional(),
  disabled: z.boolean().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  // List all users — admin only
  app.get(
    "/",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (_request, reply) => {
      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users);

      return reply.send({ users: allUsers });
    }
  );

  // Create user — admin only
  app.post(
    "/",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { email, password, name, role } = parsed.data;

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing.length > 0) {
        return reply.status(409).send({ error: "Email already registered" });
      }

      const passwordHash = await argon2.hash(password);

      const [user] = await db
        .insert(users)
        .values({ email, passwordHash, name, role })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          createdAt: users.createdAt,
        });

      return reply.status(201).send({ user });
    }
  );

  // Get single user — admin or self
  app.get(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (request.user!.role !== "admin" && request.user!.userId !== id) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.send({ user });
    }
  );

  // Update user — admin or self (non-role fields)
  app.patch(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const isAdmin = request.user!.role === "admin";
      const isSelf = request.user!.userId === id;

      if (!isAdmin && !isSelf) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const parsed = updateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { name, role, password } = parsed.data;

      // Non-admins cannot change their own role
      if (!isAdmin && role !== undefined) {
        return reply.status(403).send({ error: "Cannot change role" });
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (name !== undefined) updates.name = name;
      if (role !== undefined) updates.role = role;
      if (password !== undefined) {
        updates.passwordHash = await argon2.hash(password);
      }

      const [user] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          updatedAt: users.updatedAt,
        });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.send({ user });
    }
  );

  // Delete user — admin only, cannot delete self
  app.delete(
    "/:id",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (request.user!.userId === id) {
        return reply.status(400).send({ error: "Cannot delete your own account" });
      }

      const result = await db
        .delete(users)
        .where(eq(users.id, id))
        .returning({ id: users.id });

      if (result.length === 0) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.status(204).send();
    }
  );
}
