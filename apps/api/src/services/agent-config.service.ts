import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { agentConfigs } from "../db/schema.js";
import { decrypt } from "../lib/crypto.js";
import type { ResolvedAgentConfig } from "@content-factory/agents";
import type { AgentType } from "@content-factory/shared";

/**
 * Fetches an agent config from the DB and decrypts the API key.
 * Returns null when no config is found for that (agentType, clientId) pair.
 */
async function fetchConfig(
  agentType: AgentType,
  clientId: string | null
): Promise<ResolvedAgentConfig | null> {
  const rows = await db
    .select()
    .from(agentConfigs)
    .where(
      clientId
        ? and(eq(agentConfigs.agentType, agentType), eq(agentConfigs.clientId, clientId))
        : and(eq(agentConfigs.agentType, agentType), isNull(agentConfigs.clientId))
    )
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];

  let apiKey: string | null = null;
  if (row.apiKeyEncrypted) {
    try {
      apiKey = decrypt(row.apiKeyEncrypted);
    } catch {
      // Log but don't crash — key may be usable from env fallback on the provider
      console.warn(`Failed to decrypt API key for agentType=${agentType} clientId=${clientId}`);
    }
  }

  return {
    agentType: row.agentType,
    clientId: row.clientId,
    displayName: row.displayName,
    systemPrompt: row.systemPrompt,
    modelProvider: row.modelProvider,
    modelName: row.modelName,
    baseUrl: row.baseUrl,
    apiKey,
    temperature: row.temperature != null ? Number(row.temperature) : null,
    maxTokens: row.maxTokens,
    extraConfig: row.extraConfig as Record<string, unknown> | null,
  };
}

/**
 * Resolves the effective agent config for a client with cascade:
 *   client-specific override → global default → null (not found)
 */
export async function resolveConfig(
  agentType: AgentType,
  clientId: string
): Promise<ResolvedAgentConfig | null> {
  // Client-specific override first
  const clientConfig = await fetchConfig(agentType, clientId);
  if (clientConfig) return clientConfig;

  // Fall back to global
  return fetchConfig(agentType, null);
}
