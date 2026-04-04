import type { AgentType } from "@content-factory/shared";

export interface AgentInput {
  clientId: string;
  agentType: AgentType;
  params: Record<string, unknown>;
}

export interface AgentOutput {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  tokensUsed?: number;
}

export interface ResolvedAgentConfig {
  agentType: AgentType;
  clientId?: string | null;
  displayName: string;
  systemPrompt: string;
  modelProvider: string;
  modelName: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  extraConfig?: Record<string, unknown> | null;
}

/**
 * Resolves the effective agent config for a given agent type and client.
 * Cascade: client-specific config → global config → null (not found).
 *
 * Callers must supply a fetch function so this package stays free of direct
 * DB imports (avoids coupling to the API runtime).
 */
export async function resolveAgentConfig(
  agentType: AgentType,
  clientId: string,
  fetchConfig: (
    agentType: AgentType,
    clientId: string | null
  ) => Promise<ResolvedAgentConfig | null>
): Promise<ResolvedAgentConfig | null> {
  // 1. Try client-specific override first
  const clientConfig = await fetchConfig(agentType, clientId);
  if (clientConfig) return clientConfig;

  // 2. Fall back to global default
  const globalConfig = await fetchConfig(agentType, null);
  return globalConfig;
}

export abstract class BaseAgent {
  abstract readonly agentType: AgentType;

  abstract execute(input: AgentInput): Promise<AgentOutput>;
}
