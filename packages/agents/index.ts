import type { AgentType } from "@content-factory/shared";

// Re-export base types and classes
export { BaseAgent } from "./base.js";
export type { AgentInput, AgentOutput, ResolvedAgentConfig } from "./base.js";

export { WebsiteAnalyzerAgent } from "./website-analyzer.js";
export type { CrawledPage, WebsiteAnalyzerParams, KnowledgeBaseSection } from "./website-analyzer.js";
export { CompetitorAnalyzerAgent } from "./competitor-analyzer.js";
export type {
  CompetitorData,
  CompetitorAnalyzerParams,
  CompetitorAnalysisResult,
  CompetitorAnalysisOutput,
} from "./competitor-analyzer.js";
export { createModelFromConfig } from "./create-model.js";

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
  ) => Promise<import("./base.js").ResolvedAgentConfig | null>
): Promise<import("./base.js").ResolvedAgentConfig | null> {
  // 1. Try client-specific override first
  const clientConfig = await fetchConfig(agentType, clientId);
  if (clientConfig) return clientConfig;

  // 2. Fall back to global default
  const globalConfig = await fetchConfig(agentType, null);
  return globalConfig;
}
