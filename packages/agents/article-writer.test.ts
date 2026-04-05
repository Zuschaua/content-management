import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArticleWriterAgent } from "./article-writer.js";
import type { ResolvedAgentConfig } from "./index.js";
import * as aiModule from "ai";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("./create-model.js", () => ({
  createModelFromConfig: vi.fn().mockReturnValue({ provider: "mock", modelId: "mock-model" }),
}));

const mockConfig: ResolvedAgentConfig = {
  agentType: "article_writer",
  clientId: "test-client-id",
  displayName: "Article Writer",
  systemPrompt: "You are an expert SEO content writer.",
  modelProvider: "openai",
  modelName: "gpt-4o",
  baseUrl: null,
  apiKey: "test-api-key",
  temperature: 0.7,
  maxTokens: 4000,
};

const validParams = {
  title: "10 Best Practices for Technical SEO",
  contentFormat: "listicle" as const,
  targetKeywords: ["technical SEO", "SEO best practices"],
  wordCountTarget: 1500,
  outline: {
    sections: [
      "Introduction to Technical SEO",
      "Core Web Vitals Optimization",
      "Conclusion and Next Steps",
    ],
  },
  clientContext: {
    nicheOverview: "Digital marketing agency specializing in SEO.",
    targetAudience: "Small business owners looking to improve organic search.",
  },
};

describe("ArticleWriterAgent", () => {
  let agent: ArticleWriterAgent;

  beforeEach(() => {
    agent = new ArticleWriterAgent(mockConfig);
    vi.clearAllMocks();
  });

  it("generates sections from outline", async () => {
    const generateText = vi.mocked(aiModule.generateText);
    // Mock 3 section calls + 1 meta description call
    generateText
      .mockResolvedValueOnce({ text: "Introduction content here with some words.", usage: { totalTokens: 100 } } as never)
      .mockResolvedValueOnce({ text: "Core web vitals content with detailed explanation.", usage: { totalTokens: 150 } } as never)
      .mockResolvedValueOnce({ text: "Conclusion content wrapping up the article nicely.", usage: { totalTokens: 80 } } as never)
      .mockResolvedValueOnce({ text: "Learn the top 10 technical SEO best practices to boost your organic traffic.", usage: { totalTokens: 30 } } as never);

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "article_writer",
      params: validParams,
    });

    expect(result.success).toBe(true);
    expect(generateText).toHaveBeenCalledTimes(4); // 3 sections + 1 meta
    const data = result.data as any;
    expect(data.sections).toHaveLength(3);
    expect(data.fullBody).toContain("## Introduction to Technical SEO");
    expect(data.fullBody).toContain("## Core Web Vitals Optimization");
    expect(data.fullBody).toContain("## Conclusion and Next Steps");
    expect(data.totalWordCount).toBeGreaterThan(0);
    expect(data.metaDescription).toBeTruthy();
    expect(result.tokensUsed).toBe(360);
  });

  it("assigns correct sectionType (intro, heading, conclusion)", async () => {
    const generateText = vi.mocked(aiModule.generateText);
    generateText
      .mockResolvedValueOnce({ text: "Intro text.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "Middle text.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "Conclusion text.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "Meta desc.", usage: { totalTokens: 5 } } as never);

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "article_writer",
      params: validParams,
    });

    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.sections[0].sectionType).toBe("intro");
    expect(data.sections[1].sectionType).toBe("heading");
    expect(data.sections[2].sectionType).toBe("conclusion");
  });

  it("includes keywords in prompt", async () => {
    const generateText = vi.mocked(aiModule.generateText);
    generateText
      .mockResolvedValueOnce({ text: "Content.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "Content.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "Content.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "Meta.", usage: { totalTokens: 5 } } as never);

    await agent.execute({
      clientId: "test-client-id",
      agentType: "article_writer",
      params: validParams,
    });

    // Check first section call includes keywords
    const firstCall = generateText.mock.calls[0][0] as { prompt: string };
    expect(firstCall.prompt).toContain("technical SEO");
    expect(firstCall.prompt).toContain("SEO best practices");
  });

  it("handles missing KB context gracefully", async () => {
    const generateText = vi.mocked(aiModule.generateText);
    generateText
      .mockResolvedValueOnce({ text: "Content without context.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "More content.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "Final content.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "A meta description.", usage: { totalTokens: 5 } } as never);

    const paramsNoContext = {
      ...validParams,
      clientContext: {},
    };

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "article_writer",
      params: paramsNoContext,
    });

    expect(result.success).toBe(true);
    // Verify prompt contains fallback context message
    const firstCall = generateText.mock.calls[0][0] as { prompt: string };
    expect(firstCall.prompt).toContain("No client context provided");
  });

  it("returns error for invalid params", async () => {
    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "article_writer",
      params: { invalid: "data" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid params/);
  });

  it("returns error when LLM throws on a section", async () => {
    const generateText = vi.mocked(aiModule.generateText);
    generateText.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "article_writer",
      params: validParams,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("LLM failed on section");
    expect(result.error).toContain("API rate limit");
  });

  it("uses default system prompt when config has empty prompt", async () => {
    const configNoPrompt = { ...mockConfig, systemPrompt: "" };
    const agentNoPrompt = new ArticleWriterAgent(configNoPrompt);
    const generateText = vi.mocked(aiModule.generateText);
    generateText
      .mockResolvedValueOnce({ text: "Content.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "Content.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "Content.", usage: { totalTokens: 10 } } as never)
      .mockResolvedValueOnce({ text: "Meta.", usage: { totalTokens: 5 } } as never);

    await agentNoPrompt.execute({
      clientId: "test-client-id",
      agentType: "article_writer",
      params: validParams,
    });

    const firstCall = generateText.mock.calls[0][0] as { system: string };
    expect(firstCall.system).toContain("expert SEO content writer");
  });
});
