import type { AgentType } from "@content-factory/shared";

// Re-export base types and classes
export { BaseAgent } from "./base.js";
export type { AgentInput, AgentOutput, ResolvedAgentConfig } from "./base.js";

export { WebsiteAnalyzerAgent } from "./website-analyzer.js";
export type { CrawledPage, WebsiteAnalyzerParams, KnowledgeBaseSection } from "./website-analyzer.js";
export { BlogTrackerAgent } from "./blog-tracker.js";
export type { CrawledBlogPost, BlogTrackerParams, BlogAnalysis, BlogArticleData } from "./blog-tracker.js";
export { CompetitorAnalyzerAgent } from "./competitor-analyzer.js";
export type {
  CompetitorData,
  CompetitorAnalyzerParams,
  CompetitorAnalysisResult,
  CompetitorAnalysisOutput,
} from "./competitor-analyzer.js";
export { ArticleSuggesterAgent } from "./article-suggester.js";
export type {
  ArticleSuggesterParams,
  ArticleSuggestion,
  ArticleSuggesterOutput,
} from "./article-suggester.js";
export { ArticleWriterAgent } from "./article-writer.js";
export type {
  ArticleWriterParams,
  ArticleWriterOutput,
  WrittenSection,
  ArticleWriterClientContext,
} from "./article-writer.js";
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
