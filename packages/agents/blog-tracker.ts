import { generateObject } from "ai";
import { z } from "zod";
import type { AgentType } from "@content-factory/shared";
import { BaseAgent } from "./base.js";
import type { AgentInput, AgentOutput, ResolvedAgentConfig } from "./base.js";
import { createModelFromConfig } from "./create-model.js";

export interface CrawledBlogPost {
  url: string;
  title: string;
  content: string;
  publishDate?: string;
  estimatedWordCount?: number;
}

export interface BlogTrackerParams {
  blogUrl: string;
  crawledPosts: CrawledBlogPost[];
}

export interface BlogAnalysis {
  whatWorks: {
    title: string;
    content: string;
  };
  contentGaps: {
    title: string;
    content: string;
  };
  topics: string[];
  topKeywords: string[];
}

export interface BlogArticleData {
  url: string;
  title: string;
  topics: string[];
  keywords: string[];
  publishDate?: string;
  estimatedWordCount?: number;
}

const blogAnalysisSchema = z.object({
  whatWorks: z.object({
    title: z.string().describe("Short descriptive title for this section"),
    content: z
      .string()
      .describe(
        "2-4 paragraphs describing what content themes, formats, and topics are performing well based on the existing blog. Include patterns in topic selection, content depth, and format choices."
      ),
  }),
  contentGaps: z.object({
    title: z.string().describe("Short descriptive title for this section"),
    content: z
      .string()
      .describe(
        "2-4 paragraphs identifying content gaps — topics underserved or missing entirely from the existing blog. Consider what questions the target audience likely has that are not yet addressed."
      ),
  }),
  articles: z.array(
    z.object({
      url: z.string().describe("Article URL as provided"),
      title: z.string().describe("Article title"),
      topics: z
        .array(z.string())
        .describe("2-5 high-level topic categories for this article"),
      keywords: z
        .array(z.string())
        .describe("3-8 SEO keywords or phrases this article targets"),
      publishDate: z
        .string()
        .optional()
        .describe("ISO date string if detectable, otherwise omit"),
      estimatedWordCount: z
        .number()
        .optional()
        .describe("Estimated word count if determinable from content length"),
    })
  ),
});

const DEFAULT_SYSTEM_PROMPT = `You are an SEO content strategist analysing a client's existing blog.
Your job is to catalogue what they've already published and identify patterns and gaps.
Base all conclusions on the crawled content only — do not invent topics or trends.
Use professional, clear English. Each content field should be 2-4 paragraphs.`;

export class BlogTrackerAgent extends BaseAgent {
  readonly agentType: AgentType = "blog_tracker";

  constructor(private config: ResolvedAgentConfig) {
    super();
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const params = input.params as unknown as BlogTrackerParams;
    const { crawledPosts } = params;

    if (crawledPosts.length === 0) {
      return {
        success: false,
        error: "No blog posts were crawled — cannot analyse existing content",
      };
    }

    const crawledContent = crawledPosts
      .map(
        (p) =>
          `## ${p.title || "(no title)"}\nURL: ${p.url}${p.publishDate ? `\nPublished: ${p.publishDate}` : ""}${p.estimatedWordCount ? `\nWords: ~${p.estimatedWordCount}` : ""}\n\n${p.content}`
      )
      .join("\n\n---\n\n");

    const model = createModelFromConfig(this.config);
    const systemPrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const temperature = this.config.temperature != null ? Number(this.config.temperature) : 0.3;

    const { object, usage } = await generateObject({
      model,
      system: systemPrompt,
      prompt: `Analyse the following crawled blog posts and extract structured knowledge base information.\n\nBlog: ${params.blogUrl}\nTotal posts crawled: ${crawledPosts.length}\n\n${crawledContent}`,
      schema: blogAnalysisSchema,
      temperature,
      ...(this.config.maxTokens ? { maxTokens: this.config.maxTokens } : {}),
    });

    const analysis: BlogAnalysis = {
      whatWorks: object.whatWorks,
      contentGaps: object.contentGaps,
      topics: [...new Set(object.articles.flatMap((a) => a.topics))],
      topKeywords: [...new Set(object.articles.flatMap((a) => a.keywords))],
    };

    const articles: BlogArticleData[] = object.articles.map((a) => ({
      url: a.url,
      title: a.title,
      topics: a.topics,
      keywords: a.keywords,
      publishDate: a.publishDate,
      estimatedWordCount: a.estimatedWordCount,
    }));

    return {
      success: true,
      data: { analysis, articles },
      tokensUsed: usage?.totalTokens,
    };
  }
}
