import { generateObject } from "ai";
import { z } from "zod";
import type { AgentType } from "@content-factory/shared";
import { BaseAgent } from "./base.js";
import type { AgentInput, AgentOutput, ResolvedAgentConfig } from "./base.js";
import type { CrawledPage } from "./website-analyzer.js";
import { createModelFromConfig } from "./create-model.js";

export interface CompetitorData {
  competitorId: string;
  name: string;
  websiteUrl: string;
  crawledPages: CrawledPage[];
}

export interface CompetitorAnalyzerParams {
  competitors: CompetitorData[];
  /** Optional client KB context to inform gap analysis */
  clientContext?: {
    nicheOverview?: string;
    productsServices?: string;
    targetAudience?: string;
    existingTopics?: string[];
  };
}

export interface CompetitorAnalysisResult {
  competitorId: string;
  name: string;
  websiteUrl: string;
  topicsCovered: string[];
  estimatedPostsPerMonth: number | null;
  contentStyle: string;
  articleUrls: Array<{
    url: string;
    title: string;
    topics: string[];
    estimatedWordCount: number | null;
  }>;
}

export interface CompetitorAnalysisOutput {
  competitorProfiles: CompetitorAnalysisResult[];
  competitorsSummary: string;
  contentGaps: string[];
  contentGapsSummary: string;
}

const competitorAnalyzerParamsSchema = z.object({
  competitors: z.array(
    z.object({
      competitorId: z.string(),
      name: z.string(),
      websiteUrl: z.string(),
      crawledPages: z.array(
        z.object({
          url: z.string(),
          title: z.string(),
          content: z.string(),
        })
      ),
    })
  ),
  clientContext: z
    .object({
      nicheOverview: z.string().optional(),
      productsServices: z.string().optional(),
      targetAudience: z.string().optional(),
      existingTopics: z.array(z.string()).optional(),
    })
    .optional(),
});

const competitorProfileSchema = z.object({
  topicsCovered: z
    .array(z.string())
    .describe("List of main topics/themes covered across all crawled pages"),
  estimatedPostsPerMonth: z
    .number()
    .nullable()
    .describe(
      "Estimated number of blog posts per month based on crawled content; null if cannot determine"
    ),
  contentStyle: z
    .string()
    .describe(
      "Brief description of the competitor's content style, tone, and format preferences"
    ),
  articleUrls: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        topics: z.array(z.string()),
        estimatedWordCount: z.number().nullable(),
      })
    )
    .describe("Individual articles or content pages found"),
});

const gapAnalysisSchema = z.object({
  contentGaps: z
    .array(z.string())
    .describe(
      "Topics or content types that competitors cover but the client has not addressed; each entry is a specific, actionable content opportunity"
    ),
  competitorsSummary: z
    .string()
    .describe(
      "2-3 paragraph narrative summary of the competitive landscape based on all competitor data"
    ),
  contentGapsSummary: z
    .string()
    .describe(
      "2-3 paragraph narrative describing the content gaps and why they represent opportunities for the client"
    ),
});

const DEFAULT_SYSTEM_PROMPT = `You are an SEO content strategist performing competitive analysis.
Your job is to analyse crawled competitor websites and identify content opportunities for a client.
Be specific and actionable — base all findings only on the crawled content provided.
Focus on topics, content formats, and gaps that directly relate to the client's niche.`;

export class CompetitorAnalyzerAgent extends BaseAgent {
  readonly agentType: AgentType = "competitor_analyzer";

  constructor(private config: ResolvedAgentConfig) {
    super();
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const parsed = competitorAnalyzerParamsSchema.safeParse(input.params);
    if (!parsed.success) {
      return { success: false, error: `Invalid params: ${parsed.error.message}` };
    }
    const { competitors, clientContext } = parsed.data;

    if (competitors.length === 0) {
      return { success: false, error: "No competitors provided for analysis" };
    }

    const model = createModelFromConfig(this.config);
    const systemPrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const temperature = this.config.temperature != null ? Number(this.config.temperature) : 0.3;
    const modelOptions = {
      model,
      system: systemPrompt,
      temperature,
      ...(this.config.maxTokens ? { maxTokens: this.config.maxTokens } : {}),
    } as const;

    // Step 1: Profile each competitor individually
    const competitorProfiles: CompetitorAnalysisResult[] = [];
    let totalTokens = 0;

    for (const competitor of competitors) {
      if (competitor.crawledPages.length === 0) {
        competitorProfiles.push({
          competitorId: competitor.competitorId,
          name: competitor.name,
          websiteUrl: competitor.websiteUrl,
          topicsCovered: [],
          estimatedPostsPerMonth: null,
          contentStyle: "Could not crawl — no pages available",
          articleUrls: [],
        });
        continue;
      }

      const crawledContent = competitor.crawledPages
        .map((p) => `## ${p.title || "(no title)"}\nURL: ${p.url}\n\n${p.content}`)
        .join("\n\n---\n\n");

      let profile: z.infer<typeof competitorProfileSchema>;
      try {
        const result = await generateObject({
          ...modelOptions,
          prompt: `Analyse the following crawled content from competitor website "${competitor.name}" (${competitor.websiteUrl}) and extract a content profile.\n\n${crawledContent}`,
          schema: competitorProfileSchema,
        });
        profile = result.object;
        totalTokens += result.usage?.totalTokens ?? 0;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: `LLM analysis failed for competitor "${competitor.name}": ${message}` };
      }

      competitorProfiles.push({
        competitorId: competitor.competitorId,
        name: competitor.name,
        websiteUrl: competitor.websiteUrl,
        topicsCovered: profile.topicsCovered,
        estimatedPostsPerMonth: profile.estimatedPostsPerMonth,
        contentStyle: profile.contentStyle,
        articleUrls: profile.articleUrls,
      });
    }

    // Step 2: Cross-competitor gap analysis
    const allTopics = competitorProfiles.flatMap((c) =>
      c.topicsCovered.map((t) => `- ${c.name}: ${t}`)
    );

    const clientContextStr = clientContext
      ? [
          clientContext.nicheOverview
            ? `**Niche Overview:** ${clientContext.nicheOverview}`
            : null,
          clientContext.productsServices
            ? `**Products/Services:** ${clientContext.productsServices}`
            : null,
          clientContext.targetAudience
            ? `**Target Audience:** ${clientContext.targetAudience}`
            : null,
          clientContext.existingTopics?.length
            ? `**Client's Existing Topics:** ${clientContext.existingTopics.join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "No client context provided.";

    let gapAnalysis: z.infer<typeof gapAnalysisSchema>;
    try {
      const result = await generateObject({
        ...modelOptions,
        prompt: `Based on the competitor analysis below, identify content gaps and opportunities for the client.\n\n## Client Context\n${clientContextStr}\n\n## Competitor Topics Covered\n${allTopics.join("\n")}\n\n## Competitor Profiles\n${competitorProfiles.map((c) => `### ${c.name}\n${c.contentStyle}\nTopics: ${c.topicsCovered.join(", ")}`).join("\n\n")}`,
        schema: gapAnalysisSchema,
      });
      gapAnalysis = result.object;
      totalTokens += result.usage?.totalTokens ?? 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `LLM gap analysis failed: ${message}` };
    }

    const output: CompetitorAnalysisOutput = {
      competitorProfiles,
      competitorsSummary: gapAnalysis.competitorsSummary,
      contentGaps: gapAnalysis.contentGaps,
      contentGapsSummary: gapAnalysis.contentGapsSummary,
    };

    return {
      success: true,
      data: output as unknown as Record<string, unknown>,
      tokensUsed: totalTokens,
    };
  }
}
