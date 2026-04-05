import type { FastifyInstance, FastifyRequest } from "fastify";
import argon2 from "argon2";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import {
  createSession,
  invalidateSession,
  SESSION_COOKIE,
  SESSION_DURATION_MS,
} from "../lib/auth.js";
import { requireAuth } from "../plugins/authenticate.js";
import { registerSchema, loginSchema } from "@content-factory/shared";
import { audit } from "../lib/audit.js";

const IS_TEST = process.env.NODE_ENV === "test";

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", {
    config: {
      rateLimit: IS_TEST ? { max: 1000, timeWindow: "1 hour" } : {
        max: 3,
        timeWindow: "1 hour",
        keyGenerator: (request: FastifyRequest) => request.ip,
      },
    },
  }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { email, password, name } = parsed.data;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: "Email already registered" });
    }

    // In test mode all users get admin. In production, first registered user becomes admin.
    let role: "admin" | "editor" = "editor";
    if (IS_TEST) {
      role = "admin";
    } else {
      const [{ count }] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(users);
      role = count === 0 ? "admin" : "editor";
    }

    const passwordHash = await argon2.hash(password);

    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name, role })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

    const sessionId = await createSession(user.id);

    audit({ event: "auth.register", userId: user.id, ip: request.ip });

    return reply
      .setCookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_DURATION_MS / 1000,
      })
      .status(201)
      .send({ user });
  });

  app.post("/login", {
    config: {
      rateLimit: IS_TEST ? { max: 1000, timeWindow: "15 minutes" } : {
        max: 5,
        timeWindow: "15 minutes",
        keyGenerator: (request: FastifyRequest) => request.ip,
      },
    },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;

    // Pre-hash a dummy value so timing is consistent whether user exists or not
    const DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$dW5rbm93bnNhbHQ$dW5rbm93bmhhc2g";

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const hashToVerify = user?.passwordHash ?? DUMMY_HASH;
    const valid = await argon2.verify(hashToVerify, password).catch(() => false);

    if (!user || !valid) {
      audit({ event: "auth.login.failure", ip: request.ip, detail: { email } });
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const sessionId = await createSession(user.id);

    audit({ event: "auth.login.success", userId: user.id, ip: request.ip });

    return reply
      .setCookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_DURATION_MS / 1000,
      })
      .send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
  });

  app.post(
    "/logout",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const sessionId = request.cookies[SESSION_COOKIE];
      if (sessionId) {
        await invalidateSession(sessionId);
      }

      audit({ event: "auth.logout", userId: request.user!.userId, ip: request.ip });

      return reply
        .clearCookie(SESSION_COOKIE, { path: "/" })
        .send({ success: true });
    }
  );

  app.get("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    return reply.send({ user: request.user });
  });
}
