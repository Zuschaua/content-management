import type { Job } from "bullmq";
import { CheerioCrawler, EnqueueStrategy } from "crawlee";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  agentJobs,
  clients,
  competitors,
  competitorContent,
  knowledgeBaseSections,
  crawlJobs,
  existingBlogArticles,
} from "../db/schema.js";
import { resolveConfig } from "../services/agent-config.service.js";
import { CompetitorAnalyzerAgent } from "@content-factory/agents";
import type {
  CompetitorAnalysisOutput,
  CompetitorData,
} from "@content-factory/agents";
import type { CrawledPage } from "@content-factory/agents";

export interface AnalyzeCompetitorsJobData {
  agentJobId: string;
  clientId: string;
}

const MAX_PAGES_PER_COMPETITOR = 15;
const MAX_CONTENT_CHARS = 8000;

async function crawlCompetitor(startUrl: string): Promise<CrawledPage[]> {
  const pages: CrawledPage[] = [];

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: MAX_PAGES_PER_COMPETITOR,
    async requestHandler({ $, request, enqueueLinks }) {
      const title =
        $("title").first().text().trim() ||
        $("h1").first().text().trim() ||
        request.url;

      const contentParts: string[] = [];
      $("h1, h2, h3, h4, p, li").each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (text.length > 20) {
          contentParts.push(text);
        }
      });

      const content = contentParts.join("\n").slice(0, MAX_CONTENT_CHARS);

      if (content.length > 100) {
        pages.push({ url: request.url, title, content });
      }

      await enqueueLinks({ strategy: EnqueueStrategy.SameDomain });
    },
  });

  await crawler.run([startUrl]);
  return pages;
}

/**
 * BullMQ job processor for the "analyze-competitors" job.
 *
 * Progress milestones:
 *   10 — started, client + config loaded
 *   20 — competitors loaded from DB
 *   30 — crawl starting
 *   60 — all competitors crawled
 *   80 — LLM analysis complete
 *  100 — DB writes done
 */
export async function processAnalyzeCompetitorsJob(
  job: Job<AnalyzeCompetitorsJobData>
): Promise<void> {
  const { agentJobId, clientId } = job.data;

  // Mark job as running
  await db
    .update(agentJobs)
    .set({ status: "running", startedAt: new Date(), progress: 10 })
    .where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(10);

  // Load client
  const clientRows = await db
    .select({ id: clients.id, name: clients.name, websiteUrl: clients.websiteUrl })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (clientRows.length === 0) {
    const msg = `Client ${clientId} not found`;
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  // Resolve agent config
  const config = await resolveConfig("competitor_analyzer", clientId);
  if (!config) {
    const msg =
      "No agent config found for competitor_analyzer. Create a global config at POST /api/v1/agent-configs/global.";
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  // Load competitors for this client
  const competitorRows = await db
    .select({
      id: competitors.id,
      name: competitors.name,
      websiteUrl: competitors.websiteUrl,
    })
    .from(competitors)
    .where(eq(competitors.clientId, clientId));

  if (competitorRows.length === 0) {
    const msg = "No competitors found for this client. Add competitors first at POST /api/v1/clients/:id/competitors.";
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  await db.update(agentJobs).set({ progress: 20 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(20);

  // Load client KB context for gap analysis
  const kbSections = await db
    .select({ sectionType: knowledgeBaseSections.sectionType, content: knowledgeBaseSections.content })
    .from(knowledgeBaseSections)
    .where(eq(knowledgeBaseSections.clientId, clientId));

  const existingTopicsRows = await db
    .select({ topics: existingBlogArticles.topics })
    .from(existingBlogArticles)
    .where(eq(existingBlogArticles.clientId, clientId))
    .limit(200);

  const existingTopics = [
    ...new Set(existingTopicsRows.flatMap((r) => r.topics ?? [])),
  ];

  const clientContext = {
    nicheOverview: kbSections.find((s) => s.sectionType === "niche_overview")?.content,
    productsServices: kbSections.find((s) => s.sectionType === "products_services")?.content,
    targetAudience: kbSections.find((s) => s.sectionType === "target_audience")?.content,
    existingTopics,
  };

  await db.update(agentJobs).set({ progress: 30 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(30);

  // Crawl each competitor
  const competitorDataList: CompetitorData[] = [];
  const progressPerCompetitor = Math.floor(30 / competitorRows.length);
  let crawledCount = 0;

  for (const competitor of competitorRows) {
    // Create crawl_jobs tracking record
    const [crawlJobRow] = await db
      .insert(crawlJobs)
      .values({
        clientId,
        jobType: "competitor_analysis",
        targetUrl: competitor.websiteUrl,
        status: "running",
        startedAt: new Date(),
      })
      .returning({ id: crawlJobs.id });

    let crawledPages: CrawledPage[];
    try {
      crawledPages = await crawlCompetitor(competitor.websiteUrl);
      await db
        .update(crawlJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          resultSummary: { pageCount: crawledPages.length },
        })
        .where(eq(crawlJobs.id, crawlJobRow.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(crawlJobs)
        .set({ status: "failed", errorMessage: message, completedAt: new Date() })
        .where(eq(crawlJobs.id, crawlJobRow.id));
      // Non-fatal: continue with empty pages for this competitor
      crawledPages = [];
    }

    competitorDataList.push({
      competitorId: competitor.id,
      name: competitor.name ?? competitor.websiteUrl,
      websiteUrl: competitor.websiteUrl,
      crawledPages,
    });

    crawledCount++;
    const newProgress = 30 + progressPerCompetitor * crawledCount;
    await db.update(agentJobs).set({ progress: newProgress }).where(eq(agentJobs.id, agentJobId));
    await job.updateProgress(newProgress);
  }

  await db.update(agentJobs).set({ progress: 60 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(60);

  // Run LLM analysis
  const agent = new CompetitorAnalyzerAgent(config);
  const result = await agent.execute({
    clientId,
    agentType: "competitor_analyzer",
    params: { competitors: competitorDataList, clientContext },
  });

  if (!result.success) {
    const msg = result.error ?? "Agent returned failure without a message";
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  await db.update(agentJobs).set({ progress: 80 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(80);

  const output = result.data as unknown as CompetitorAnalysisOutput;

  // Write competitor_content records for each competitor's articles
  for (const profile of output.competitorProfiles) {
    // Delete stale content for this competitor before re-inserting
    await db
      .delete(competitorContent)
      .where(eq(competitorContent.competitorId, profile.competitorId));

    for (const article of profile.articleUrls) {
      await db.insert(competitorContent).values({
        competitorId: profile.competitorId,
        url: article.url,
        title: article.title || null,
        topics: article.topics,
        estimatedWordCount: article.estimatedWordCount ?? null,
        lastCrawledAt: new Date(),
      });
    }
  }

  // Upsert KB section: "competitors"
  await upsertKbSection(
    clientId,
    "competitors",
    "Competitor Landscape",
    output.competitorsSummary,
    0
  );

  // Upsert KB section: "content_gaps"
  await upsertKbSection(
    clientId,
    "content_gaps",
    "Content Gaps & Opportunities",
    output.contentGapsSummary,
    1
  );

  // Mark complete
  await db
    .update(agentJobs)
    .set({
      status: "completed",
      progress: 100,
      completedAt: new Date(),
      outputData: {
        competitorsAnalysed: output.competitorProfiles.length,
        contentGapsFound: output.contentGaps.length,
        articlesIndexed: output.competitorProfiles.reduce(
          (sum, c) => sum + c.articleUrls.length,
          0
        ),
      },
      tokensUsed: result.tokensUsed ?? null,
    })
    .where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(100);
}

async function upsertKbSection(
  clientId: string,
  sectionType: "competitors" | "content_gaps",
  title: string,
  content: string,
  sortOrder: number
): Promise<void> {
  const existing = await db
    .select({ id: knowledgeBaseSections.id, version: knowledgeBaseSections.version })
    .from(knowledgeBaseSections)
    .where(
      and(
        eq(knowledgeBaseSections.clientId, clientId),
        eq(knowledgeBaseSections.sectionType, sectionType)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(knowledgeBaseSections)
      .set({
        title,
        content,
        sourceAgent: "competitor_analyzer",
        version: (existing[0].version ?? 1) + 1,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBaseSections.id, existing[0].id));
  } else {
    await db.insert(knowledgeBaseSections).values({
      clientId,
      sectionType,
      title,
      content,
      sourceAgent: "competitor_analyzer",
      sortOrder,
    });
  }
}
