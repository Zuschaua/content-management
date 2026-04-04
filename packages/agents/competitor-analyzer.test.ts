import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompetitorAnalyzerAgent } from "./competitor-analyzer.js";
import type { ResolvedAgentConfig } from "./index.js";
import * as aiModule from "ai";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("./create-model.js", () => ({
  createModelFromConfig: vi.fn().mockReturnValue({ provider: "mock", modelId: "mock-model" }),
}));

const mockConfig: ResolvedAgentConfig = {
  agentType: "competitor_analyzer",
  clientId: "test-client-id",
  displayName: "Competitor Analyzer",
  systemPrompt: "You are a competitor analyst.",
  modelProvider: "openai",
  modelName: "gpt-4o-mini",
  baseUrl: null,
  apiKey: "test-api-key",
  temperature: 0.3,
  maxTokens: 2000,
};

const mockCrawledPages = [
  {
    url: "https://competitor.com/blog/seo-tips",
    title: "10 SEO Tips",
    content: "Search engine optimisation is essential. Keywords matter. Backlinks are important.",
  },
  {
    url: "https://competitor.com/blog/content-marketing",
    title: "Content Marketing Guide",
    content: "Content marketing involves creating valuable content to attract customers.",
  },
];

const mockProfileResponse = {
  object: {
    topicsCovered: ["SEO", "content marketing", "keyword research"],
    estimatedPostsPerMonth: 4,
    contentStyle: "Educational, long-form articles targeting intermediate marketers",
    articleUrls: [
      {
        url: "https://competitor.com/blog/seo-tips",
        title: "10 SEO Tips",
        topics: ["SEO", "keyword research"],
        estimatedWordCount: 1500,
      },
      {
        url: "https://competitor.com/blog/content-marketing",
        title: "Content Marketing Guide",
        topics: ["content marketing"],
        estimatedWordCount: 2000,
      },
    ],
  },
  usage: { totalTokens: 500 },
};

const mockGapAnalysisResponse = {
  object: {
    contentGaps: [
      "Technical SEO audits — competitor covers basics but not advanced",
      "Local SEO strategies — not addressed by any competitor",
    ],
    competitorsSummary:
      "CompetitorCo focuses on educational content for intermediate marketers.",
    contentGapsSummary:
      "There are clear opportunities in technical SEO and local search.",
  },
  usage: { totalTokens: 300 },
};

describe("CompetitorAnalyzerAgent", () => {
  let agent: CompetitorAnalyzerAgent;

  beforeEach(() => {
    agent = new CompetitorAnalyzerAgent(mockConfig);
    vi.clearAllMocks();
  });

  it("should return error for invalid params", async () => {
    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "competitor_analyzer",
      params: { invalid: "data" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid params/);
  });

  it("should return error when no competitors provided", async () => {
    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "competitor_analyzer",
      params: { competitors: [] },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("No competitors provided for analysis");
  });

  it("should analyse a single competitor and return structured output", async () => {
    const generateObject = vi.mocked(aiModule.generateObject);
    generateObject
      .mockResolvedValueOnce(mockProfileResponse as never) // profile call
      .mockResolvedValueOnce(mockGapAnalysisResponse as never); // gap analysis call

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "competitor_analyzer",
      params: {
        competitors: [
          {
            competitorId: "comp-1",
            name: "CompetitorCo",
            websiteUrl: "https://competitor.com",
            crawledPages: mockCrawledPages,
          },
        ],
        clientContext: {
          nicheOverview: "We provide SEO services for small businesses.",
          existingTopics: ["SEO basics"],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(generateObject).toHaveBeenCalledTimes(2);

    const data = result.data as {
      competitorProfiles: Array<{
        competitorId: string;
        topicsCovered: string[];
        articleUrls: unknown[];
      }>;
      contentGaps: string[];
      competitorsSummary: string;
    };
    expect(data.competitorProfiles).toHaveLength(1);
    expect(data.competitorProfiles[0].competitorId).toBe("comp-1");
    expect(data.competitorProfiles[0].topicsCovered).toContain("SEO");
    expect(data.contentGaps).toHaveLength(2);
    expect(data.competitorsSummary).toBeTruthy();
    expect(result.tokensUsed).toBe(800);
  });

  it("should handle competitor with no crawled pages gracefully", async () => {
    const generateObject = vi.mocked(aiModule.generateObject);
    generateObject.mockResolvedValueOnce(mockGapAnalysisResponse as never); // only gap analysis, no profile

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "competitor_analyzer",
      params: {
        competitors: [
          {
            competitorId: "comp-empty",
            name: "Empty Competitor",
            websiteUrl: "https://empty.com",
            crawledPages: [], // no pages
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    // Profile call skipped for empty pages, only gap analysis called
    expect(generateObject).toHaveBeenCalledTimes(1);

    const data = result.data as { competitorProfiles: Array<{ topicsCovered: string[] }> };
    expect(data.competitorProfiles[0].topicsCovered).toHaveLength(0);
  });

  it("should return error when LLM throws during profile analysis", async () => {
    const generateObject = vi.mocked(aiModule.generateObject);
    generateObject.mockRejectedValueOnce(new Error("Rate limit exceeded"));

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "competitor_analyzer",
      params: {
        competitors: [
          {
            competitorId: "comp-1",
            name: "CompetitorCo",
            websiteUrl: "https://competitor.com",
            crawledPages: mockCrawledPages,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Rate limit exceeded/);
  });

  it("should return error when LLM throws during gap analysis", async () => {
    const generateObject = vi.mocked(aiModule.generateObject);
    generateObject
      .mockResolvedValueOnce(mockProfileResponse as never)
      .mockRejectedValueOnce(new Error("Context length exceeded"));

    const result = await agent.execute({
      clientId: "test-client-id",
      agentType: "competitor_analyzer",
      params: {
        competitors: [
          {
            competitorId: "comp-1",
            name: "CompetitorCo",
            websiteUrl: "https://competitor.com",
            crawledPages: mockCrawledPages,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/gap analysis failed/);
    expect(result.error).toMatch(/Context length exceeded/);
  });
});
