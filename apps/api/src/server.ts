import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { clientRoutes } from "./routes/clients.js";
import { userRoutes } from "./routes/users.js";
import { agentConfigRoutes } from "./routes/agent-configs.js";
import { knowledgeBaseRoutes } from "./routes/knowledge-base.js";
import { agentRoutes } from "./routes/agents.js";
import { articleRoutes } from "./routes/articles.js";
import { calendarRoutes } from "./routes/calendar.js";
import { competitorRoutes } from "./routes/competitors.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import authenticatePlugin from "./plugins/authenticate.js";
import clientScopePlugin from "./plugins/client-scope.js";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
});

await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  credentials: true,
});

await app.register(cookie);
await app.register(authenticatePlugin);
await app.register(clientScopePlugin);

// Routes
await app.register(healthRoutes, { prefix: "/api/v1" });
await app.register(authRoutes, { prefix: "/api/v1/auth" });
await app.register(clientRoutes, { prefix: "/api/v1/clients" });
await app.register(userRoutes, { prefix: "/api/v1/users" });
await app.register(agentConfigRoutes, { prefix: "/api/v1/agent-configs" });
await app.register(knowledgeBaseRoutes, { prefix: "/api/v1/clients" });
await app.register(agentRoutes, { prefix: "/api/v1/clients" });
await app.register(articleRoutes, { prefix: "/api/v1/clients" });
await app.register(calendarRoutes, { prefix: "/api/v1/clients" });
await app.register(competitorRoutes, { prefix: "/api/v1/clients" });
await app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });

const port = parseInt(process.env.PORT ?? "3001", 10);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  app.log.info(`Server listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export default app;
