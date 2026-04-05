import { generateObject } from "ai";
import { z } from "zod";
import type { AgentType } from "@content-factory/shared";
import { BaseAgent } from "./base.js";
import type { AgentInput, AgentOutput, ResolvedAgentConfig } from "./base.js";
import { createModelFromConfig } from "./create-model.js";

export interface ArticleSuggesterParams {
  count: number;
  preferences?: string;
  clientContext: {
    nicheOverview?: string;
    productsServices?: string;
    targetAudience?: string;
    competitors?: string;
    contentGaps?: string;
    whatWorks?: string;
  };
  existingArticles: Array<{
    title: string;
    topics?: string[];
    keywords?: string[];
  }>;
}

export interface ArticleSuggestion {
  title: string;
  contentFormat: "how_to" | "listicle" | "deep_dive" | "comparison" | "general";
  targetKeywords: string[];
  wordCountTarget: number;
  outline: { sections: string[] };
  strategicRationale: string;
  seoScore: number;
}

export interface ArticleSuggesterOutput {
  suggestions: ArticleSuggestion[];
}

const articleSuggesterParamsSchema = z.object({
  count: z.number().int().min(1).max(20),
  preferences: z.string().optional(),
  clientContext: z.object({
    nicheOverview: z.string().optional(),
    productsServices: z.string().optional(),
    targetAudience: z.string().optional(),
    competitors: z.string().optional(),
    contentGaps: z.string().optional(),
    whatWorks: z.string().optional(),
  }),
  existingArticles: z.array(
    z.object({
      title: z.string(),
      topics: z.array(z.string()).optional(),
      keywords: z.array(z.string()).optional(),
    })
  ),
});

const contentFormatValues = ["how_to", "listicle", "deep_dive", "comparison", "general"] as const;

const articleSuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string().describe("Compelling, SEO-optimised article title"),
        contentFormat: z
          .enum(contentFormatValues)
          .describe("Best format for this topic: how_to, listicle, deep_dive, comparison, or general"),
        targetKeywords: z
          .array(z.string())
          .describe("2-5 specific keywords or phrases this article should rank for"),
        wordCountTarget: z
          .number()
          .int()
          .describe("Suggested word count — typically 800–2500 depending on topic depth"),
        outline: z
          .object({
            sections: z
              .array(z.string())
              .describe("Ordered list of section headings for the article"),
          })
          .describe("Brief structural outline for the article"),
        strategicRationale: z
          .string()
          .describe(
            "1-2 sentences explaining why this topic is a strong content opportunity for the client right now"
          ),
        seoScore: z
          .number()
          .int()
          .min(0)
          .max(100)
          .describe(
            "Estimated SEO opportunity score 0-100 based on keyword difficulty, search volume potential, and content gap alignment"
          ),
      })
    )
    .describe("List of article topic suggestions, each distinct and not duplicating existing content"),
});

const MAX_PREFERENCES_LENGTH = 500;

/**
 * Sanitize user-provided preferences text to prevent prompt injection.
 * Strips markdown directives and system-prompt-like patterns, truncates to a safe length.
 */
function sanitizePreferences(raw: string): string {
  return raw
    // Strip markdown heading markers that could restructure prompt
    .replace(/^#{1,6}\s/gm, "")
    // Strip triple-backtick code fences
    .replace(/```[\s\S]*?```/g, "")
    // Strip patterns that look like system/assistant role injections
    .replace(/\b(system|assistant)\s*:/gi, "")
    // Strip XML-like tags commonly used for prompt injection
    .replace(/<\/?[a-z][a-z0-9-]*\b[^>]*>/gi, "")
    .slice(0, MAX_PREFERENCES_LENGTH)
    .trim();
}

const DEFAULT_SYSTEM_PROMPT = `You are an SEO content strategist generating article topic suggestions for a client.
Your goal is to propose high-value blog post topics that fill content gaps, target realistic keywords, and align with the client's audience and business.
Only suggest topics that are genuinely distinct from the client's existing articles — never duplicate covered subjects.
Ground every suggestion in the client's niche, products, and the competitive landscape provided.`;

export class ArticleSuggesterAgent extends BaseAgent {
  readonly agentType: AgentType = "suggestion_engine";

  constructor(private config: ResolvedAgentConfig) {
    super();
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const parsed = articleSuggesterParamsSchema.safeParse(input.params);
    if (!parsed.success) {
      return { success: false, error: `Invalid params: ${parsed.error.message}` };
    }
    const { count, preferences, clientContext, existingArticles } = parsed.data;

    const model = createModelFromConfig(this.config);
    const systemPrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const temperature = this.config.temperature != null ? Number(this.config.temperature) : 0.7;

    // Build client context block
    const contextLines: string[] = [];
    if (clientContext.nicheOverview) {
      contextLines.push(`**Niche Overview:** ${clientContext.nicheOverview}`);
    }
    if (clientContext.productsServices) {
      contextLines.push(`**Products / Services:** ${clientContext.productsServices}`);
    }
    if (clientContext.targetAudience) {
      contextLines.push(`**Target Audience:** ${clientContext.targetAudience}`);
    }
    if (clientContext.competitors) {
      contextLines.push(`**Competitive Landscape:** ${clientContext.competitors}`);
    }
    if (clientContext.contentGaps) {
      contextLines.push(`**Known Content Gaps:** ${clientContext.contentGaps}`);
    }
    if (clientContext.whatWorks) {
      contextLines.push(`**What Works for This Client:** ${clientContext.whatWorks}`);
    }

    const contextBlock =
      contextLines.length > 0 ? contextLines.join("\n") : "No client context provided.";

    // Build existing articles block for deduplication
    const existingBlock =
      existingArticles.length > 0
        ? existingArticles
            .map((a) => {
              const parts = [`- "${a.title}"`];
              if (a.topics?.length) parts.push(`topics: ${a.topics.join(", ")}`);
              if (a.keywords?.length) parts.push(`keywords: ${a.keywords.join(", ")}`);
              return parts.join(" | ");
            })
            .join("\n")
        : "No existing articles — this is a fresh blog.";

    const preferencesBlock = preferences
      ? `\n\n**Additional Preferences from User:**\n${sanitizePreferences(preferences)}`
      : "";

    const prompt = `Generate exactly ${count} unique article topic suggestions for this client.

## Client Context
${contextBlock}

## Existing Articles (DO NOT duplicate these topics)
${existingBlock}${preferencesBlock}

Each suggestion must be clearly distinct from the existing articles and from every other suggestion in this batch.`;

    let result: { object: { suggestions: ArticleSuggestion[] }; usage?: { totalTokens?: number } };
    try {
      result = await generateObject({
        model,
        system: systemPrompt,
        prompt,
        schema: articleSuggestionSchema,
        temperature,
        ...(this.config.maxTokens ? { maxTokens: this.config.maxTokens } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `LLM suggestion generation failed: ${message}` };
    }

    const output: ArticleSuggesterOutput = {
      suggestions: result.object.suggestions,
    };

    return {
      success: true,
      data: output as unknown as Record<string, unknown>,
      tokensUsed: result.usage?.totalTokens ?? 0,
    };
  }
}
