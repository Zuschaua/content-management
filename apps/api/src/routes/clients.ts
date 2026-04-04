import type { FastifyInstance } from "fastify";

export async function clientRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    // TODO: List clients
    return [];
  });

  app.post("/", async (request, reply) => {
    // TODO: Create client
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/:id", async (request, reply) => {
    // TODO: Get client by ID
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.patch("/:id", async (request, reply) => {
    // TODO: Update client
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.delete("/:id", async (request, reply) => {
    // TODO: Delete client
    return reply.status(501).send({ error: "Not implemented" });
  });
}
