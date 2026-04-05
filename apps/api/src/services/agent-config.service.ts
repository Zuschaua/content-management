import { eq, and, isNull, isNotNull } from "drizzle-orm";
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
    } catch (err) {
      console.error(
        `[agent-config] Failed to decrypt API key for agentType=${agentType} clientId=${clientId}:`,
        err instanceof Error ? err.message : err
      );
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
 * Finds a decrypted API key from any global config that shares the given modelProvider.
 * Used as a last-resort fallback when the resolved config has no apiKey.
 */
async function findApiKeyByProvider(modelProvider: string | null): Promise<string | null> {
  if (!modelProvider) return null;

  const rows = await db
    .select({ apiKeyEncrypted: agentConfigs.apiKeyEncrypted })
    .from(agentConfigs)
    .where(
      and(
        eq(agentConfigs.modelProvider, modelProvider),
        isNull(agentConfigs.clientId),
        isNotNull(agentConfigs.apiKeyEncrypted)
      )
    )
    .limit(1);

  if (rows.length === 0 || !rows[0].apiKeyEncrypted) return null;

  try {
    return decrypt(rows[0].apiKeyEncrypted);
  } catch {
    return null;
  }
}

/**
 * Resolves the effective agent config for a client with cascade:
 *   client-specific override → global default → same-provider apiKey borrow → null
 */
export async function resolveConfig(
  agentType: AgentType,
  clientId: string
): Promise<ResolvedAgentConfig | null> {
  // Client-specific override first
  const clientConfig = await fetchConfig(agentType, clientId);
  if (clientConfig) {
    if (clientConfig.apiKey) return clientConfig;
    const fallbackKey = await findApiKeyByProvider(clientConfig.modelProvider);
    if (fallbackKey) return { ...clientConfig, apiKey: fallbackKey };
    return clientConfig;
  }

  // Fall back to global
  const globalConfig = await fetchConfig(agentType, null);
  if (globalConfig) {
    if (globalConfig.apiKey) return globalConfig;
    const fallbackKey = await findApiKeyByProvider(globalConfig.modelProvider);
    if (fallbackKey) return { ...globalConfig, apiKey: fallbackKey };
    return globalConfig;
  }

  return null;
}
