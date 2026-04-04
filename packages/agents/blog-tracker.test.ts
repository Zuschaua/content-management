import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlogTrackerAgent } from "./blog-tracker.js";

// Mock the Vercel AI SDK
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

// Mock the model factory
vi.mock("./create-model.js", () => ({
  createModelFromConfig: vi.fn().mockReturnValue({ /* stub model */ }),
}));

import { generateObject } from "ai";

const mockConfig = {
  agentType: "blog_tracker" as const,
  clientId: "client-123",
  displayName: "Blog Tracker",
  systemPrompt: "You are an SEO content strategist.",
  modelProvider: "openai",
  modelName: "gpt-4o",
  baseUrl: null,
  apiKey: "test-key",
  temperature: 0.3,
  maxTokens: 4000,
  extraConfig: null,
};

const mockCrawledPosts = [
  {
    url: "https://example.com/blog/how-to-scale-kubernetes",
    title: "How to Scale Kubernetes in Production",
    content:
      "Kubernetes scaling is one of the most critical challenges for growing engineering teams. In this guide we cover horizontal pod autoscaling, cluster autoscaling, and resource quotas. We also discuss monitoring with Prometheus.",
    publishDate: "2024-03-15",
    estimatedWordCount: 1200,
  },
  {
    url: "https://example.com/blog/ci-cd-best-practices",
    title: "CI/CD Best Practices for Modern Teams",
    content:
      "Continuous integration and deployment pipelines are the backbone of any modern software team. We explore trunk-based development, feature flags, and automated testing strategies. GitOps workflows are also covered in depth.",
    publishDate: "2024-01-20",
    estimatedWordCount: 950,
  },
  {
    url: "https://example.com/blog/devops-cost-optimisation",
    title: "Cutting Cloud Costs Without Slowing Down",
    content:
      "Cloud bills can spiral quickly. This article looks at spot instances, resource tagging, and right-sizing strategies. We share how our customers saved 40% on AWS costs while maintaining performance SLAs.",
    publishDate: "2023-11-10",
    estimatedWordCount: 800,
  },
];

const mockLLMResponse = {
  object: {
    whatWorks: {
      title: "Technical How-To Content Drives Engagement",
      content:
        "The blog performs well with in-depth technical tutorials targeting DevOps engineers. Posts covering Kubernetes and CI/CD show strong depth and actionable advice. Cost optimisation content also resonates with decision-makers.",
    },
    contentGaps: {
      title: "Security and Compliance Topics Underserved",
      content:
        "The existing blog has no coverage of Kubernetes security hardening, SOC 2 compliance, or secrets management. These are common concerns for the target audience of mid-market engineering teams and represent clear gap opportunities.",
    },
    articles: [
      {
        url: "https://example.com/blog/how-to-scale-kubernetes",
        title: "How to Scale Kubernetes in Production",
        topics: ["Kubernetes", "DevOps", "Infrastructure"],
        keywords: ["kubernetes scaling", "horizontal pod autoscaling", "cluster autoscaler"],
        publishDate: "2024-03-15",
        estimatedWordCount: 1200,
      },
      {
        url: "https://example.com/blog/ci-cd-best-practices",
        title: "CI/CD Best Practices for Modern Teams",
        topics: ["CI/CD", "DevOps", "Software Engineering"],
        keywords: ["ci/cd pipeline", "trunk based development", "gitops"],
        publishDate: "2024-01-20",
        estimatedWordCount: 950,
      },
      {
        url: "https://example.com/blog/devops-cost-optimisation",
        title: "Cutting Cloud Costs Without Slowing Down",
        topics: ["Cloud Cost", "AWS", "DevOps"],
        keywords: ["cloud cost optimisation", "spot instances", "aws savings"],
        publishDate: "2023-11-10",
        estimatedWordCount: 800,
      },
    ],
  },
  usage: { totalTokens: 1800 },
};

describe("BlogTrackerAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return failure when no posts are crawled", async () => {
    const agent = new BlogTrackerAgent(mockConfig);
    const result = await agent.execute({
      clientId: "client-123",
      agentType: "blog_tracker",
      params: { blogUrl: "https://example.com/blog", crawledPosts: [] },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no blog posts were crawled/i);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("should call generateObject with crawled post content", async () => {
    vi.mocked(generateObject).mockResolvedValue(mockLLMResponse as unknown as Awaited<ReturnType<typeof generateObject>>);

    const agent = new BlogTrackerAgent(mockConfig);
    await agent.execute({
      clientId: "client-123",
      agentType: "blog_tracker",
      params: { blogUrl: "https://example.com/blog", crawledPosts: mockCrawledPosts },
    });

    expect(generateObject).toHaveBeenCalledOnce();
    const call = vi.mocked(generateObject).mock.calls[0][0];
    expect(call.system).toBe(mockConfig.systemPrompt);
    expect(call.prompt).toContain("https://example.com/blog");
    expect(call.prompt).toContain("How to Scale Kubernetes in Production");
    expect(call.temperature).toBe(0.3);
  });

  it("should return analysis and articles on success", async () => {
    vi.mocked(generateObject).mockResolvedValue(mockLLMResponse as unknown as Awaited<ReturnType<typeof generateObject>>);

    const agent = new BlogTrackerAgent(mockConfig);
    const result = await agent.execute({
      clientId: "client-123",
      agentType: "blog_tracker",
      params: { blogUrl: "https://example.com/blog", crawledPosts: mockCrawledPosts },
    });

    expect(result.success).toBe(true);
    expect(result.tokensUsed).toBe(1800);

    const analysis = result.data?.analysis as { whatWorks: { title: string }; contentGaps: { title: string }; topics: string[]; topKeywords: string[] };
    expect(analysis.whatWorks.title).toBe("Technical How-To Content Drives Engagement");
    expect(analysis.contentGaps.title).toBe("Security and Compliance Topics Underserved");
    expect(analysis.topics).toContain("Kubernetes");
    expect(analysis.topKeywords).toContain("kubernetes scaling");

    const articles = result.data?.articles as Array<{ url: string; title: string }>;
    expect(articles).toHaveLength(3);
    expect(articles[0].url).toBe("https://example.com/blog/how-to-scale-kubernetes");
  });

  it("should use default system prompt when config has no systemPrompt", async () => {
    vi.mocked(generateObject).mockResolvedValue(mockLLMResponse as unknown as Awaited<ReturnType<typeof generateObject>>);

    const configNoPrompt = { ...mockConfig, systemPrompt: "" };
    const agent = new BlogTrackerAgent(configNoPrompt);
    await agent.execute({
      clientId: "client-123",
      agentType: "blog_tracker",
      params: { blogUrl: "https://example.com/blog", crawledPosts: mockCrawledPosts },
    });

    const call = vi.mocked(generateObject).mock.calls[0][0];
    expect(call.system).toContain("SEO content strategist");
  });

  it("should deduplicate topics and keywords across articles", async () => {
    const responseDupTopics = {
      ...mockLLMResponse,
      object: {
        ...mockLLMResponse.object,
        articles: [
          { ...mockLLMResponse.object.articles[0], topics: ["DevOps", "Kubernetes"], keywords: ["devops", "kubernetes"] },
          { ...mockLLMResponse.object.articles[1], topics: ["DevOps", "CI/CD"], keywords: ["devops", "ci/cd"] },
        ],
      },
    };
    vi.mocked(generateObject).mockResolvedValue(responseDupTopics as unknown as Awaited<ReturnType<typeof generateObject>>);

    const agent = new BlogTrackerAgent(mockConfig);
    const result = await agent.execute({
      clientId: "client-123",
      agentType: "blog_tracker",
      params: { blogUrl: "https://example.com/blog", crawledPosts: mockCrawledPosts.slice(0, 2) },
    });

    const analysis = result.data?.analysis as { topics: string[]; topKeywords: string[] };
    const topicCount = analysis.topics.filter((t) => t === "DevOps").length;
    expect(topicCount).toBe(1);
    const keywordCount = analysis.topKeywords.filter((k) => k === "devops").length;
    expect(keywordCount).toBe(1);
  });

  it("should propagate errors thrown by generateObject", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("LLM service unavailable"));

    const agent = new BlogTrackerAgent(mockConfig);
    await expect(
      agent.execute({
        clientId: "client-123",
        agentType: "blog_tracker",
        params: { blogUrl: "https://example.com/blog", crawledPosts: mockCrawledPosts },
      })
    ).rejects.toThrow("LLM service unavailable");
  });

  it("should throw a ZodError when params are invalid", async () => {
    const agent = new BlogTrackerAgent(mockConfig);
    await expect(
      agent.execute({
        clientId: "client-123",
        agentType: "blog_tracker",
        params: { blogUrl: 123, crawledPosts: "not-an-array" } as unknown as Record<string, unknown>,
      })
    ).rejects.toThrow();
  });

  it("should throw when model factory throws during execute", async () => {
    const { createModelFromConfig } = await import("./create-model.js");
    vi.mocked(createModelFromConfig).mockImplementationOnce(() => {
      throw new Error("Invalid API key");
    });

    const agent = new BlogTrackerAgent(mockConfig);
    await expect(
      agent.execute({
        clientId: "client-123",
        agentType: "blog_tracker",
        params: { blogUrl: "https://example.com/blog", crawledPosts: mockCrawledPosts },
      })
    ).rejects.toThrow("Invalid API key");
  });
});
