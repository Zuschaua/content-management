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

export abstract class BaseAgent {
  abstract readonly agentType: AgentType;

  abstract execute(input: AgentInput): Promise<AgentOutput>;
}
