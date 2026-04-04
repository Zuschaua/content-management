import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { validateSession, SESSION_COOKIE } from "../lib/auth.js";

export type AuthUser = {
  userId: string;
  role: "admin" | "editor" | "writer";
  name: string;
  email: string;
};

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

async function authenticatePlugin(app: FastifyInstance) {
  app.decorateRequest("user", null);

  app.addHook("onRequest", async (request: FastifyRequest) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (!sessionId) return;

    const user = await validateSession(sessionId);
    if (user) {
      request.user = user as AuthUser;
    }
  });
}

export default fp(authenticatePlugin);

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}

export function requireRole(...roles: AuthUser["role"][]) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  };
}
