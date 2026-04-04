import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebsiteAnalyzerAgent } from "./website-analyzer.js";
import type { ResolvedAgentConfig } from "./index.js";

// Mock the Vercel AI SDK
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

// Mock the model factory
vi.mock("./create-model.js", () => ({
  createModelFromConfig: vi.fn().mockReturnValue({ /* stub model */ }),
}));

import { generateObject } from "ai";

const mockConfig: ResolvedAgentConfig = {
  agentType: "website_analyzer",
  clientId: "client-123",
  displayName: "Website Analyzer",
  systemPrompt: "You are a content strategist.",
  modelProvider: "openai",
  modelName: "gpt-4o",
  baseUrl: null,
  apiKey: "test-key",
  temperature: 0.3,
  maxTokens: 2000,
  extraConfig: null,
};

const mockCrawledPages = [
  {
    url: "https://example.com",
    title: "Example Co — Cloud Solutions",
    content:
      "We provide enterprise cloud infrastructure solutions for mid-market companies. Our services include managed Kubernetes, CI/CD pipelines, and 24/7 support. We serve software teams that want to move fast without managing infrastructure.",
  },
  {
    url: "https://example.com/products",
    title: "Products — Example Co",
    content:
      "Managed Kubernetes: Starting at $500/month. CI/CD Pipeline: Starting at $200/month. Priority Support: Starting at $300/month.",
  },
];

const mockLLMResponse = {
  object: {
    nicheOverview: {
      title: "Enterprise Cloud Infrastructure",
      content:
        "Example Co is a managed cloud infrastructure provider targeting mid-market software companies. The company positions itself as a hands-off solution for engineering teams who want to ship fast.",
    },
    productsServices: {
      title: "Managed Cloud Services",
      content:
        "The company offers three core products: Managed Kubernetes ($500/month), CI/CD Pipeline ($200/month), and Priority Support ($300/month).",
    },
    targetAudience: {
      title: "Mid-Market Software Engineering Teams",
      content:
        "The primary audience is software engineering teams at mid-market companies who want to reduce DevOps overhead and focus on product development.",
    },
  },
  usage: { totalTokens: 350, promptTokens: 300, completionTokens: 50 },
};

describe("WebsiteAnalyzerAgent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(generateObject).mockResolvedValue(mockLLMResponse as never);
  });

  it("returns the correct agentType", () => {
    const agent = new WebsiteAnalyzerAgent(mockConfig);
    expect(agent.agentType).toBe("website_analyzer");
  });

  it("returns 3 KB sections on success", async () => {
    const agent = new WebsiteAnalyzerAgent(mockConfig);
    const result = await agent.execute({
      clientId: "client-123",
      agentType: "website_analyzer",
      params: { websiteUrl: "https://example.com", crawledPages: mockCrawledPages },
    });

    expect(result.success).toBe(true);
    expect(result.data?.sections).toHaveLength(3);
    const sections = result.data?.sections as Array<{ sectionType: string }>;
    expect(sections.map((s) => s.sectionType)).toEqual([
      "niche_overview",
      "products_services",
      "target_audience",
    ]);
  });

  it("includes token usage in output", async () => {
    const agent = new WebsiteAnalyzerAgent(mockConfig);
    const result = await agent.execute({
      clientId: "client-123",
      agentType: "website_analyzer",
      params: { websiteUrl: "https://example.com", crawledPages: mockCrawledPages },
    });

    expect(result.tokensUsed).toBe(350);
  });

  it("returns failure when no pages are crawled", async () => {
    const agent = new WebsiteAnalyzerAgent(mockConfig);
    const result = await agent.execute({
      clientId: "client-123",
      agentType: "website_analyzer",
      params: { websiteUrl: "https://example.com", crawledPages: [] },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no pages/i);
    // Should not call the LLM
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("passes systemPrompt and temperature to generateObject", async () => {
    const agent = new WebsiteAnalyzerAgent(mockConfig);
    await agent.execute({
      clientId: "client-123",
      agentType: "website_analyzer",
      params: { websiteUrl: "https://example.com", crawledPages: mockCrawledPages },
    });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        system: mockConfig.systemPrompt,
        temperature: 0.3,
      })
    );
  });

  it("falls back to default system prompt when config has empty prompt", async () => {
    const agentNoPrompt = new WebsiteAnalyzerAgent({ ...mockConfig, systemPrompt: "" });
    await agentNoPrompt.execute({
      clientId: "client-123",
      agentType: "website_analyzer",
      params: { websiteUrl: "https://example.com", crawledPages: mockCrawledPages },
    });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("SEO content strategist"),
      })
    );
  });

  it("propagates LLM errors as exceptions", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("LLM rate limited"));
    const agent = new WebsiteAnalyzerAgent(mockConfig);

    await expect(
      agent.execute({
        clientId: "client-123",
        agentType: "website_analyzer",
        params: { websiteUrl: "https://example.com", crawledPages: mockCrawledPages },
      })
    ).rejects.toThrow("LLM rate limited");
  });
});
