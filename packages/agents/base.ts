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

export abstract class BaseAgent {
  abstract readonly agentType: AgentType;

  abstract execute(input: AgentInput): Promise<AgentOutput>;
}
