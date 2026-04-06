import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import type { AgentType } from "@content-factory/shared";
import { BaseAgent } from "./base.js";
import type { AgentInput, AgentOutput, ResolvedAgentConfig } from "./base.js";
import { createModelFromConfig } from "./create-model.js";

export interface ArticleWriterClientContext {
  nicheOverview?: string;
  productsServices?: string;
  targetAudience?: string;
  competitors?: string;
  contentGaps?: string;
  whatWorks?: string;
}

export interface ArticleWriterParams {
  title: string;
  contentFormat: "how_to" | "listicle" | "deep_dive" | "comparison" | "general";
  targetKeywords: string[];
  wordCountTarget: number;
  outline: { sections: string[] };
  clientContext: ArticleWriterClientContext;
}

export interface WrittenSection {
  heading: string;
  body: string;
  sectionType: "intro" | "heading" | "subheading" | "conclusion";
  wordCount: number;
}

export interface ArticleWriterOutput {
  sections: WrittenSection[];
  fullBody: string;
  totalWordCount: number;
  metaDescription: string;
}

const contentFormatValues = ["how_to", "listicle", "deep_dive", "comparison", "general"] as const;

const articleWriterParamsSchema = z.object({
  title: z.string().min(1),
  contentFormat: z.enum(contentFormatValues),
  targetKeywords: z.array(z.string()),
  wordCountTarget: z.number().int().positive(),
  outline: z.object({
    sections: z.array(z.string()).min(1),
  }),
  clientContext: z.object({
    nicheOverview: z.string().optional(),
    productsServices: z.string().optional(),
    targetAudience: z.string().optional(),
    competitors: z.string().optional(),
    contentGaps: z.string().optional(),
    whatWorks: z.string().optional(),
  }),
});

const FORMAT_INSTRUCTIONS: Record<string, string> = {
  how_to: "Write in a step-by-step instructional format. Use clear, actionable steps. Include practical tips and examples.",
  listicle: "Write in a numbered list format. Each item should have a descriptive heading and supporting explanation.",
  deep_dive: "Write in an analytical, in-depth format. Explore the topic thoroughly with evidence and examples.",
  comparison: "Write in a comparative format. Present balanced analysis of alternatives with pros and cons.",
  general: "Write in a clear, informative blog post format with engaging prose.",
};

const DEFAULT_SYSTEM_PROMPT = `You are an expert SEO content writer. You write natural, readable, well-structured blog content that incorporates target keywords organically — never keyword-stuffing.

Your writing is:
- Clear and engaging, with a professional but approachable tone
- Well-structured with logical flow between ideas
- Optimised for search engines without sacrificing readability
- Backed by practical insights and actionable advice where relevant

Always match the requested content format and write the exact section requested. Output only the section content — no headings, no meta-commentary.`;

const outlineSchema = z.object({
  sections: z.array(z.string()).min(2).max(10),
});

/**
 * Generates an article outline from metadata + KB context when one is missing.
 */
export async function generateOutline(params: {
  model: LanguageModel;
  title: string;
  contentFormat: string;
  targetKeywords: string[];
  wordCountTarget: number;
  clientContext: ArticleWriterClientContext;
}): Promise<{ sections: string[] }> {
  const contextLines: string[] = [];
  if (params.clientContext.nicheOverview) contextLines.push(`Niche: ${params.clientContext.nicheOverview}`);
  if (params.clientContext.targetAudience) contextLines.push(`Audience: ${params.clientContext.targetAudience}`);
  if (params.clientContext.contentGaps) contextLines.push(`Content gaps: ${params.clientContext.contentGaps}`);

  const contextBlock = contextLines.length > 0 ? contextLines.join("\n") : "No additional context.";

  const result = await generateObject({
    model: params.model,
    schema: outlineSchema,
    prompt: `Generate section headings for an SEO article.

Title: ${params.title}
Format: ${params.contentFormat}
Target keywords: ${params.targetKeywords.join(", ") || "none"}
Target word count: ${params.wordCountTarget}

${contextBlock}

Return an array of section headings including an introduction and conclusion. Each heading should be concise and descriptive.`,
  });

  return result.object;
}

export class ArticleWriterAgent extends BaseAgent {
  readonly agentType: AgentType = "article_writer";

  constructor(private config: ResolvedAgentConfig) {
    super();
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const parsed = articleWriterParamsSchema.safeParse(input.params);
    if (!parsed.success) {
      return { success: false, error: `Invalid params: ${parsed.error.message}` };
    }

    const params = parsed.data;
    const { title, contentFormat, targetKeywords, wordCountTarget, outline, clientContext } = params;
    const sectionCount = outline.sections.length;
    const wordsPerSection = Math.round(wordCountTarget / sectionCount);

    const model = createModelFromConfig(this.config);
    const systemPrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const temperature = this.config.temperature != null ? Number(this.config.temperature) : 0.7;

    const contextBlock = this.buildClientContextBlock(clientContext);
    const formatInstruction = FORMAT_INSTRUCTIONS[contentFormat] ?? FORMAT_INSTRUCTIONS.general;

    const sections: WrittenSection[] = [];
    const previousSummaries: string[] = [];
    let totalTokens = 0;

    for (let i = 0; i < sectionCount; i++) {
      const heading = outline.sections[i];
      const sectionType = this.determineSectionType(i, sectionCount);

      const rollingContext = previousSummaries.length > 0
        ? `\n\nPrevious sections covered:\n${previousSummaries.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}`
        : "";

      const prompt = `Write the following section of a blog article.

## Article Details
- **Title:** ${title}
- **Content Format:** ${contentFormat}
- **Target Keywords:** ${targetKeywords.join(", ")}
- **Section:** "${heading}" (section ${i + 1} of ${sectionCount})
- **Section Type:** ${sectionType}
- **Target Word Count:** ~${wordsPerSection} words

## Format Instructions
${formatInstruction}

## Client Context
${contextBlock}${rollingContext}

Write the content for this section now. Output only the prose — no heading, no markdown heading prefix.`;

      let result: { text: string; usage?: { totalTokens?: number } };
      try {
        result = await generateText({
          model,
          system: systemPrompt,
          prompt,
          temperature,
          ...(this.config.maxTokens ? { maxTokens: this.config.maxTokens } : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: `LLM failed on section "${heading}": ${message}` };
      }

      const body = result.text.trim();
      const wordCount = body.split(/\s+/).filter(Boolean).length;
      totalTokens += result.usage?.totalTokens ?? 0;

      sections.push({ heading, body, sectionType, wordCount });
      previousSummaries.push(heading);
    }

    // Generate meta description
    const fullBody = this.assembleBody(sections);
    const totalWordCount = sections.reduce((sum, s) => sum + s.wordCount, 0);

    let metaDescription: string;
    try {
      const metaResult = await generateText({
        model,
        system: "You are an SEO specialist. Write a concise, compelling meta description.",
        prompt: `Write a meta description (150-160 characters) for the following article:\n\nTitle: ${title}\nKeywords: ${targetKeywords.join(", ")}\n\nArticle summary: ${previousSummaries.join(", ")}`,
        temperature: 0.5,
        maxTokens: 200,
      });
      metaDescription = metaResult.text.trim();
      totalTokens += metaResult.usage?.totalTokens ?? 0;
    } catch {
      // Non-fatal — use a fallback
      metaDescription = `${title} — ${targetKeywords.slice(0, 3).join(", ")}`;
    }

    const output: ArticleWriterOutput = {
      sections,
      fullBody,
      totalWordCount,
      metaDescription,
    };

    return {
      success: true,
      data: output as unknown as Record<string, unknown>,
      tokensUsed: totalTokens,
    };
  }

  /**
   * Rewrites a single section with optional user instructions.
   */
  async rewriteSection(params: {
    heading: string;
    currentBody: string;
    title: string;
    contentFormat: string;
    targetKeywords: string[];
    clientContext: ArticleWriterClientContext;
    instructions?: string;
  }): Promise<{ success: boolean; body?: string; wordCount?: number; tokensUsed?: number; error?: string }> {
    const model = createModelFromConfig(this.config);
    const systemPrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const temperature = this.config.temperature != null ? Number(this.config.temperature) : 0.7;

    const contextBlock = this.buildClientContextBlock(params.clientContext);
    const instructionsBlock = params.instructions
      ? `\n\n## User Instructions\n${params.instructions}`
      : "";

    const prompt = `Rewrite the following section of a blog article.

## Article Details
- **Title:** ${params.title}
- **Content Format:** ${params.contentFormat}
- **Target Keywords:** ${params.targetKeywords.join(", ")}
- **Section Heading:** "${params.heading}"

## Current Section Content
${params.currentBody}

## Client Context
${contextBlock}${instructionsBlock}

Rewrite this section, improving clarity, engagement, and SEO value. Output only the prose — no heading.`;

    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt,
        temperature,
        ...(this.config.maxTokens ? { maxTokens: this.config.maxTokens } : {}),
      });

      const body = result.text.trim();
      const wordCount = body.split(/\s+/).filter(Boolean).length;

      return {
        success: true,
        body,
        wordCount,
        tokensUsed: result.usage?.totalTokens ?? 0,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `LLM rewrite failed: ${message}` };
    }
  }

  private determineSectionType(index: number, total: number): "intro" | "heading" | "subheading" | "conclusion" {
    if (index === 0) return "intro";
    if (index === total - 1) return "conclusion";
    return "heading";
  }

  private assembleBody(sections: WrittenSection[]): string {
    return sections
      .map((s) => `## ${s.heading}\n\n${s.body}`)
      .join("\n\n");
  }

  private buildClientContextBlock(ctx: ArticleWriterClientContext): string {
    const lines: string[] = [];
    if (ctx.nicheOverview) lines.push(`**Niche Overview:** ${ctx.nicheOverview}`);
    if (ctx.productsServices) lines.push(`**Products / Services:** ${ctx.productsServices}`);
    if (ctx.targetAudience) lines.push(`**Target Audience:** ${ctx.targetAudience}`);
    if (ctx.competitors) lines.push(`**Competitive Landscape:** ${ctx.competitors}`);
    if (ctx.contentGaps) lines.push(`**Known Content Gaps:** ${ctx.contentGaps}`);
    if (ctx.whatWorks) lines.push(`**What Works:** ${ctx.whatWorks}`);
    return lines.length > 0 ? lines.join("\n") : "No client context provided.";
  }
}
