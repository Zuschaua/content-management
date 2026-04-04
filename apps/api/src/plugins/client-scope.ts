import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";

declare module "fastify" {
  interface FastifyRequest {
    clientId: string | null;
  }
}

/**
 * Reads X-Client-Id from request headers and validates the client exists.
 * Injects req.clientId for use in downstream route handlers.
 * Does not block requests without a clientId — routes that need it
 * should call requireClientScope() as a preHandler.
 */
async function clientScopePlugin(app: FastifyInstance) {
  app.decorateRequest("clientId", null);

  app.addHook("onRequest", async (request: FastifyRequest) => {
    const clientId = request.headers["x-client-id"];
    if (!clientId || typeof clientId !== "string") return;

    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (client) {
      request.clientId = client.id;
    }
  });
}

export default fp(clientScopePlugin);

/**
 * PreHandler: requires a valid clientId to be present on the request.
 * Use on routes that must be scoped to a specific client.
 */
export async function requireClientScope(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.clientId) {
    return reply
      .status(400)
      .send({ error: "X-Client-Id header is required and must be a valid client" });
  }
}
