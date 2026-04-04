import type { FastifyInstance } from "fastify";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { agentConfigs, agentPromptVersions, clients } from "../db/schema.js";
import { requireAuth, requireRole } from "../plugins/authenticate.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import {
  createAgentConfigSchema,
  updateAgentConfigSchema,
  rollbackPromptSchema,
} from "@content-factory/shared";

// Columns returned to clients — never include the encrypted API key
const configSelectFields = {
  id: agentConfigs.id,
  agentType: agentConfigs.agentType,
  clientId: agentConfigs.clientId,
  displayName: agentConfigs.displayName,
  systemPrompt: agentConfigs.systemPrompt,
  modelProvider: agentConfigs.modelProvider,
  modelName: agentConfigs.modelName,
  baseUrl: agentConfigs.baseUrl,
  hasApiKey: agentConfigs.apiKeyEncrypted,
  temperature: agentConfigs.temperature,
  maxTokens: agentConfigs.maxTokens,
  extraConfig: agentConfigs.extraConfig,
  version: agentConfigs.version,
  createdAt: agentConfigs.createdAt,
  updatedAt: agentConfigs.updatedAt,
} as const;

function sanitizeConfig(row: Record<string, unknown>) {
  // Replace the raw encrypted key with a boolean "has API key" flag
  return {
    ...row,
    hasApiKey: !!row.hasApiKey,
  };
}

export async function agentConfigRoutes(app: FastifyInstance) {
  // GET /agent-configs/global — list global configs (no clientId)
  app.get(
    "/global",
    { preHandler: [requireAuth] },
    async (_request, reply) => {
      const rows = await db
        .select(configSelectFields)
        .from(agentConfigs)
        .where(isNull(agentConfigs.clientId))
        .orderBy(agentConfigs.agentType);

      return reply.send({ configs: rows.map(sanitizeConfig) });
    }
  );

  // GET /agent-configs/global/:agentType — get single global config
  app.get(
    "/global/:agentType",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { agentType } = request.params as { agentType: string };

      const [row] = await db
        .select(configSelectFields)
        .from(agentConfigs)
        .where(
          and(
            eq(agentConfigs.agentType, agentType as typeof agentConfigs.agentType._.data),
            isNull(agentConfigs.clientId)
          )
        )
        .limit(1);

      if (!row) return reply.status(404).send({ error: "Config not found" });
      return reply.send({ config: sanitizeConfig(row) });
    }
  );

  // POST /agent-configs/global — create global config (admin only)
  app.post(
    "/global",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const parsed = createAgentConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const {
        agentType,
        displayName,
        systemPrompt,
        modelProvider,
        modelName,
        baseUrl,
        apiKey,
        temperature,
        maxTokens,
        extraConfig,
      } = parsed.data;

      const apiKeyEncrypted = apiKey ? encrypt(apiKey) : null;

      const [row] = await db
        .insert(agentConfigs)
        .values({
          agentType,
          clientId: null,
          displayName,
          systemPrompt,
          modelProvider,
          modelName,
          baseUrl,
          apiKeyEncrypted,
          temperature: temperature?.toString(),
          maxTokens,
          extraConfig,
          version: 1,
        })
        .returning(configSelectFields);

      // Record initial version
      await db.insert(agentPromptVersions).values({
        agentConfigId: row.id,
        version: 1,
        systemPrompt,
        changedBy: request.user!.userId,
      });

      return reply.status(201).send({ config: sanitizeConfig(row) });
    }
  );

  // GET /clients/:clientId/agent-configs — list configs for a specific client
  app.get(
    "/clients/:clientId/agent-configs",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };

      // Verify client exists
      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!client) return reply.status(404).send({ error: "Client not found" });

      const rows = await db
        .select(configSelectFields)
        .from(agentConfigs)
        .where(eq(agentConfigs.clientId, clientId))
        .orderBy(agentConfigs.agentType);

      return reply.send({ configs: rows.map(sanitizeConfig) });
    }
  );

  // POST /clients/:clientId/agent-configs — create client-specific config (admin only)
  app.post(
    "/clients/:clientId/agent-configs",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: string };

      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!client) return reply.status(404).send({ error: "Client not found" });

      const parsed = createAgentConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const {
        agentType,
        displayName,
        systemPrompt,
        modelProvider,
        modelName,
        baseUrl,
        apiKey,
        temperature,
        maxTokens,
        extraConfig,
      } = parsed.data;

      const apiKeyEncrypted = apiKey ? encrypt(apiKey) : null;

      const [row] = await db
        .insert(agentConfigs)
        .values({
          agentType,
          clientId,
          displayName,
          systemPrompt,
          modelProvider,
          modelName,
          baseUrl,
          apiKeyEncrypted,
          temperature: temperature?.toString(),
          maxTokens,
          extraConfig,
          version: 1,
        })
        .returning(configSelectFields);

      await db.insert(agentPromptVersions).values({
        agentConfigId: row.id,
        version: 1,
        systemPrompt,
        changedBy: request.user!.userId,
      });

      return reply.status(201).send({ config: sanitizeConfig(row) });
    }
  );

  // GET /agent-configs/:id — get single config by id
  app.get(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [row] = await db
        .select(configSelectFields)
        .from(agentConfigs)
        .where(eq(agentConfigs.id, id))
        .limit(1);

      if (!row) return reply.status(404).send({ error: "Config not found" });
      return reply.send({ config: sanitizeConfig(row) });
    }
  );

  // PATCH /agent-configs/:id — update config (admin only)
  app.patch(
    "/:id",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed = updateAgentConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      // Load current record to bump version if prompt changed
      const [current] = await db
        .select({
          version: agentConfigs.version,
          systemPrompt: agentConfigs.systemPrompt,
        })
        .from(agentConfigs)
        .where(eq(agentConfigs.id, id))
        .limit(1);

      if (!current) return reply.status(404).send({ error: "Config not found" });

      const {
        displayName,
        systemPrompt,
        modelProvider,
        modelName,
        baseUrl,
        apiKey,
        temperature,
        maxTokens,
        extraConfig,
      } = parsed.data;

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (displayName !== undefined) updates.displayName = displayName;
      if (modelProvider !== undefined) updates.modelProvider = modelProvider;
      if (modelName !== undefined) updates.modelName = modelName;
      if (baseUrl !== undefined) updates.baseUrl = baseUrl;
      if (temperature !== undefined) updates.temperature = temperature?.toString();
      if (maxTokens !== undefined) updates.maxTokens = maxTokens;
      if (extraConfig !== undefined) updates.extraConfig = extraConfig;
      if (apiKey !== undefined) updates.apiKeyEncrypted = apiKey ? encrypt(apiKey) : null;

      const promptChanged = systemPrompt !== undefined && systemPrompt !== current.systemPrompt;
      if (promptChanged) {
        const newVersion = (current.version ?? 1) + 1;
        updates.systemPrompt = systemPrompt;
        updates.version = newVersion;

        // Save version snapshot before updating
        await db.insert(agentPromptVersions).values({
          agentConfigId: id,
          version: newVersion,
          systemPrompt: systemPrompt!,
          changedBy: request.user!.userId,
        });
      }

      const [row] = await db
        .update(agentConfigs)
        .set(updates)
        .where(eq(agentConfigs.id, id))
        .returning(configSelectFields);

      return reply.send({ config: sanitizeConfig(row) });
    }
  );

  // DELETE /agent-configs/:id — delete config (admin only)
  app.delete(
    "/:id",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const rows = await db
        .delete(agentConfigs)
        .where(eq(agentConfigs.id, id))
        .returning({ id: agentConfigs.id });

      if (rows.length === 0) return reply.status(404).send({ error: "Config not found" });
      return reply.status(204).send();
    }
  );

  // GET /agent-configs/:id/versions — list prompt version history
  app.get(
    "/:id/versions",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [config] = await db
        .select({ id: agentConfigs.id })
        .from(agentConfigs)
        .where(eq(agentConfigs.id, id))
        .limit(1);

      if (!config) return reply.status(404).send({ error: "Config not found" });

      const versions = await db
        .select({
          id: agentPromptVersions.id,
          agentConfigId: agentPromptVersions.agentConfigId,
          version: agentPromptVersions.version,
          systemPrompt: agentPromptVersions.systemPrompt,
          changedBy: agentPromptVersions.changedBy,
          createdAt: agentPromptVersions.createdAt,
        })
        .from(agentPromptVersions)
        .where(eq(agentPromptVersions.agentConfigId, id))
        .orderBy(desc(agentPromptVersions.version));

      return reply.send({ versions });
    }
  );

  // POST /agent-configs/:id/rollback — rollback to a previous prompt version (admin only)
  app.post(
    "/:id/rollback",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed = rollbackPromptSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { version: targetVersion } = parsed.data;

      const [targetVersionRow] = await db
        .select({
          systemPrompt: agentPromptVersions.systemPrompt,
        })
        .from(agentPromptVersions)
        .where(
          and(
            eq(agentPromptVersions.agentConfigId, id),
            eq(agentPromptVersions.version, targetVersion)
          )
        )
        .limit(1);

      if (!targetVersionRow) {
        return reply.status(404).send({ error: "Version not found" });
      }

      // Get current version to bump
      const [current] = await db
        .select({ version: agentConfigs.version })
        .from(agentConfigs)
        .where(eq(agentConfigs.id, id))
        .limit(1);

      if (!current) return reply.status(404).send({ error: "Config not found" });

      const newVersion = (current.version ?? 1) + 1;

      // Insert new version record (rollback creates a new version entry)
      await db.insert(agentPromptVersions).values({
        agentConfigId: id,
        version: newVersion,
        systemPrompt: targetVersionRow.systemPrompt,
        changedBy: request.user!.userId,
      });

      const [row] = await db
        .update(agentConfigs)
        .set({
          systemPrompt: targetVersionRow.systemPrompt,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(eq(agentConfigs.id, id))
        .returning(configSelectFields);

      return reply.send({ config: sanitizeConfig(row) });
    }
  );

  // GET /agent-configs/resolve/:agentType — resolve config for active client (cascade)
  app.get(
    "/resolve/:agentType",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { agentType } = request.params as { agentType: string };
      const clientId = request.headers["x-client-id"] as string | undefined;

      let row = null;

      if (clientId) {
        // Try client-specific first
        const [clientRow] = await db
          .select(configSelectFields)
          .from(agentConfigs)
          .where(
            and(
              eq(agentConfigs.agentType, agentType as typeof agentConfigs.agentType._.data),
              eq(agentConfigs.clientId, clientId)
            )
          )
          .limit(1);
        if (clientRow) row = clientRow;
      }

      if (!row) {
        // Fall back to global
        const [globalRow] = await db
          .select(configSelectFields)
          .from(agentConfigs)
          .where(
            and(
              eq(agentConfigs.agentType, agentType as typeof agentConfigs.agentType._.data),
              isNull(agentConfigs.clientId)
            )
          )
          .limit(1);
        if (globalRow) row = globalRow;
      }

      if (!row) return reply.status(404).send({ error: "No config found for this agent type" });
      return reply.send({ config: sanitizeConfig(row) });
    }
  );
}
