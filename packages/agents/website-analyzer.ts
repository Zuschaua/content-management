import { generateObject } from "ai";
import { z } from "zod";
import type { AgentType } from "@content-factory/shared";
import { BaseAgent } from "./base.js";
import type { AgentInput, AgentOutput, ResolvedAgentConfig } from "./base.js";
import { createModelFromConfig } from "./create-model.js";

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
}

export interface WebsiteAnalyzerParams {
  websiteUrl: string;
  crawledPages: CrawledPage[];
}

export interface KnowledgeBaseSection {
  sectionType: "niche_overview" | "products_services" | "target_audience";
  title: string;
  content: string;
}

const websiteAnalyzerParamsSchema = z.object({
  websiteUrl: z.string().url(),
  crawledPages: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      content: z.string(),
    })
  ),
});

const kbSectionsSchema = z.object({
  nicheOverview: z.object({
    title: z.string().describe("Short descriptive title for this section"),
    content: z
      .string()
      .describe(
        "2-4 paragraph overview of the business niche, market position, and value proposition"
      ),
  }),
  productsServices: z.object({
    title: z.string().describe("Short descriptive title for this section"),
    content: z
      .string()
      .describe(
        "Detailed description of the products and/or services offered, including key features and pricing if visible"
      ),
  }),
  targetAudience: z.object({
    title: z.string().describe("Short descriptive title for this section"),
    content: z
      .string()
      .describe(
        "Description of the target audience — demographics, pain points, goals, and buying behaviour"
      ),
  }),
});

const DEFAULT_SYSTEM_PROMPT = `You are an SEO content strategist analysing a client website.
Your job is to extract structured knowledge from crawled website content to populate a knowledge base.
Be factual and specific — base all conclusions only on what is present in the crawled content.
Use professional, clear English. Each content field should be 2-4 paragraphs.`;

export class WebsiteAnalyzerAgent extends BaseAgent {
  readonly agentType: AgentType = "website_analyzer";

  constructor(private config: ResolvedAgentConfig) {
    super();
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const parsed = websiteAnalyzerParamsSchema.safeParse(input.params);
    if (!parsed.success) {
      return { success: false, error: `Invalid params: ${parsed.error.message}` };
    }
    const params = parsed.data;
    const { crawledPages } = params;

    if (crawledPages.length === 0) {
      return {
        success: false,
        error: "No pages were crawled — cannot analyse website",
      };
    }

    const crawledContent = crawledPages
      .map((p) => `## ${p.title || "(no title)"}\nURL: ${p.url}\n\n${p.content}`)
      .join("\n\n---\n\n");

    const model = createModelFromConfig(this.config);
    const systemPrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const temperature = this.config.temperature != null ? Number(this.config.temperature) : 0.3;

    let object: z.infer<typeof kbSectionsSchema>;
    let usage: { totalTokens?: number } | undefined;
    try {
      const result = await generateObject({
        model,
        system: systemPrompt,
        prompt: `Analyse the following crawled website content and extract structured knowledge base information.\n\nWebsite: ${params.websiteUrl}\n\n${crawledContent}`,
        schema: kbSectionsSchema,
        temperature,
        ...(this.config.maxTokens ? { maxTokens: this.config.maxTokens } : {}),
      });
      object = result.object;
      usage = result.usage;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `LLM analysis failed: ${message}` };
    }

    const sections: KnowledgeBaseSection[] = [
      {
        sectionType: "niche_overview",
        title: object.nicheOverview.title,
        content: object.nicheOverview.content,
      },
      {
        sectionType: "products_services",
        title: object.productsServices.title,
        content: object.productsServices.content,
      },
      {
        sectionType: "target_audience",
        title: object.targetAudience.title,
        content: object.targetAudience.content,
      },
    ];

    return {
      success: true,
      data: { sections },
      tokensUsed: usage?.totalTokens,
    };
  }
}
