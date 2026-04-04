import type { FastifyInstance } from "fastify";

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    // TODO: Implement user registration
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/login", async (request, reply) => {
    // TODO: Implement login
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/logout", async (request, reply) => {
    // TODO: Implement logout
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/me", async (request, reply) => {
    // TODO: Implement get current user
    return reply.status(501).send({ error: "Not implemented" });
  });
}
