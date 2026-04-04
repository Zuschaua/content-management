import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArticleSuggesterAgent } from "./article-suggester.js";
import type { ResolvedAgentConfig } from "./index.js";
import * as aiModule from "ai";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("./create-model.js", () => ({
  createModelFromConfig: vi.fn().mockReturnValue({ provider: "mock", modelId: "mock-model" }),
}));

const mockConfig: ResolvedAgentConfig = {
  agentType: "suggestion_engine",
  clientId: "test-client-id",
  displayName: "Suggestion Engine",
  systemPrompt: "You are an SEO content strategist.",
  modelProvider: "openai",
  modelName: "gpt-4o-mini",
  baseUrl: null,
  apiKey: "test-api-key",
  temperature: 0.7,
  maxTokens: 4000,
};

const mockSuggestions = [
  {
    title: "10 Technical SEO Fixes That Double Organic Traffic",
    contentFormat: "listicle" as const,
    targetKeywords: ["technical SEO", "SEO fixes", "organic traffic"],
    wordCountTarget: 1800,
    outline: {
      sections: [
        "Introduction",
        "Fix 1: Page Speed Optimisation",
        "Fix 2: Core Web Vitals",
        "Conclusion",
      ],
    },
    strategicRationale:
      "Competitors avoid deep technical content — this fills a clear gap and targets high-intent queries.",
  },
  {
    title: "Local SEO for Small Businesses: A Complete 2025 Guide",
    contentFormat: "deep_dive" as const,
    targetKeywords: ["local SEO", "small business SEO", "Google Business Profile"],
    wordCountTarget: 2500,
    outline: {
      sections: [
        "Why Local SEO Matters",
        "Google Business Profile Setup",
        "Local Citations",
        "Review Management",
      ],
    },
    strategicRationale:
      "Local SEO is underserved in the client's existing content and represents a large segment of their target audience.",
  },
];

const mockLLMResponse = {
  object: { suggestions: mockSuggestions },
  usage: { totalTokens: 750 },
};

describe("ArticleSuggesterAgent", () => {
  let agent: ArticleSuggesterAgent;

  beforeEach(() => {
    agent = new ArticleSuggesterAgent(mockConfig);
    vi.clearAllMocks();
  });

  it("should return error for invalid params", async () => {
    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "suggestion_engine",
      params: { invalid: "data" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid params/);
  });

  it("should return error when count is out of range", async () => {
    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "suggestion_engine",
      params: {
        count: 0,
        clientContext: {},
        existingArticles: [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid params/);
  });

  it("should generate suggestions successfully", async () => {
    const generateObject = vi.mocked(aiModule.generateObject);
    generateObject.mockResolvedValueOnce(mockLLMResponse as never);

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "suggestion_engine",
      params: {
        count: 2,
        clientContext: {
          nicheOverview: "We provide SEO services for small businesses.",
          targetAudience: "Small business owners aged 30-50.",
          contentGaps: "Technical SEO and local SEO are underserved.",
        },
        existingArticles: [
          {
            title: "Beginner's Guide to SEO",
            topics: ["SEO basics"],
            keywords: ["SEO", "search engine optimisation"],
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(generateObject).toHaveBeenCalledTimes(1);

    const data = result.data as { suggestions: typeof mockSuggestions };
    expect(data.suggestions).toHaveLength(2);
    expect(data.suggestions[0].title).toBe("10 Technical SEO Fixes That Double Organic Traffic");
    expect(data.suggestions[0].contentFormat).toBe("listicle");
    expect(data.suggestions[0].targetKeywords).toContain("technical SEO");
    expect(result.tokensUsed).toBe(750);
  });

  it("should work with no existing articles", async () => {
    const generateObject = vi.mocked(aiModule.generateObject);
    generateObject.mockResolvedValueOnce(mockLLMResponse as never);

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "suggestion_engine",
      params: {
        count: 2,
        clientContext: { nicheOverview: "Fresh blog with no history." },
        existingArticles: [],
      },
    });

    expect(result.success).toBe(true);

    // Verify prompt includes "fresh blog" dedup notice
    const call = generateObject.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("fresh blog");
  });

  it("should include user preferences in the prompt", async () => {
    const generateObject = vi.mocked(aiModule.generateObject);
    generateObject.mockResolvedValueOnce(mockLLMResponse as never);

    await agent.execute({
      clientId: "test-client-id",
      agentType: "suggestion_engine",
      params: {
        count: 2,
        preferences: "Focus on topics relevant to e-commerce clients.",
        clientContext: {},
        existingArticles: [],
      },
    });

    const call = generateObject.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("e-commerce clients");
  });

  it("should return error when LLM throws", async () => {
    const generateObject = vi.mocked(aiModule.generateObject);
    generateObject.mockRejectedValueOnce(new Error("Rate limit exceeded"));

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "suggestion_engine",
      params: {
        count: 5,
        clientContext: {},
        existingArticles: [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/LLM suggestion generation failed/);
    expect(result.error).toMatch(/Rate limit exceeded/);
  });

  it("should use default system prompt when config has none", async () => {
    const configWithoutPrompt = { ...mockConfig, systemPrompt: "" };
    const agentNoPrompt = new ArticleSuggesterAgent(configWithoutPrompt);
    const generateObject = vi.mocked(aiModule.generateObject);
    generateObject.mockResolvedValueOnce(mockLLMResponse as never);

    await agentNoPrompt.execute({
      clientId: "test-client-id",
      agentType: "suggestion_engine",
      params: { count: 2, clientContext: {}, existingArticles: [] },
    });

    const call = generateObject.mock.calls[0][0] as { system: string };
    expect(call.system).toContain("SEO content strategist");
  });
});
