import type { Job } from "bullmq";
import { CheerioCrawler, EnqueueStrategy } from "crawlee";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { agentJobs, clients, knowledgeBaseSections, crawlJobs } from "../db/schema.js";
import { resolveConfig } from "../services/agent-config.service.js";
import { WebsiteAnalyzerAgent } from "@content-factory/agents";
import type { CrawledPage, KnowledgeBaseSection } from "@content-factory/agents";

export interface AnalyzeWebsiteJobData {
  agentJobId: string;
  clientId: string;
}

const MAX_PAGES = 20;
const MAX_CONTENT_CHARS = 8000;

/**
 * Crawls a client website using CheerioCrawler (lightweight, no browser binary required).
 * Follows same-domain links up to MAX_PAGES. Returns extracted text content per page.
 */
async function crawlWebsite(startUrl: string): Promise<CrawledPage[]> {
  const pages: CrawledPage[] = [];

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: MAX_PAGES,
    async requestHandler({ $, request, enqueueLinks }) {
      const title =
        $("title").first().text().trim() ||
        $("h1").first().text().trim() ||
        request.url;

      // Extract meaningful text: headings and body paragraphs
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

      // Follow links on the same domain only
      await enqueueLinks({ strategy: EnqueueStrategy.SameDomain });
    },
  });

  await crawler.run([startUrl]);
  return pages;
}

/**
 * Upserts a KB section for a client.
 * Updates if a section of the same type already exists; inserts otherwise.
 */
async function upsertKbSection(
  clientId: string,
  section: KnowledgeBaseSection,
  sortOrder: number
): Promise<void> {
  const existing = await db
    .select({ id: knowledgeBaseSections.id, version: knowledgeBaseSections.version, sectionType: knowledgeBaseSections.sectionType })
    .from(knowledgeBaseSections)
    .where(eq(knowledgeBaseSections.clientId, clientId))
    .limit(100)
    .then((rows) => rows.find((r) => r.sectionType === section.sectionType));

  // Note: sectionType is a pgEnum column — Drizzle returns the raw string value,
  // so comparing r.sectionType === section.sectionType works at runtime even though
  // TypeScript sees r.sectionType as the enum type.

  if (existing) {
    await db
      .update(knowledgeBaseSections)
      .set({
        title: section.title,
        content: section.content,
        sourceAgent: "website_analyzer",
        version: (existing.version ?? 1) + 1,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBaseSections.id, existing.id));
  } else {
    await db.insert(knowledgeBaseSections).values({
      clientId,
      sectionType: section.sectionType,
      title: section.title,
      content: section.content,
      sourceAgent: "website_analyzer",
      sortOrder,
    });
  }
}

/**
 * BullMQ job processor for the "analyze-website" job.
 *
 * Progress milestones:
 *   10 — started, client loaded
 *   20 — agent config resolved
 *   30 — crawl starting
 *   60 — crawl complete
 *   80 — LLM analysis complete
 *  100 — KB sections written, done
 */
export async function processAnalyzeWebsiteJob(job: Job<AnalyzeWebsiteJobData>): Promise<void> {
  const { agentJobId, clientId } = job.data;

  // Mark job as running
  await db
    .update(agentJobs)
    .set({ status: "running", startedAt: new Date(), progress: 10 })
    .where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(10);

  // Load client record
  const clientRows = await db
    .select({ id: clients.id, websiteUrl: clients.websiteUrl, name: clients.name })
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

  const client = clientRows[0];

  // Resolve agent config: client override → global default
  const config = await resolveConfig("website_analyzer", clientId);
  if (!config) {
    const msg = `No agent config found for website_analyzer. Create a global config at POST /api/v1/agent-configs/global.`;
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  await db.update(agentJobs).set({ progress: 20 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(20);

  // Create crawl_jobs tracking record
  const [crawlJobRow] = await db
    .insert(crawlJobs)
    .values({
      clientId,
      jobType: "website_analysis",
      targetUrl: client.websiteUrl,
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: crawlJobs.id });

  await db.update(agentJobs).set({ progress: 30 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(30);

  // Crawl the website
  let crawledPages: CrawledPage[];
  try {
    crawledPages = await crawlWebsite(client.websiteUrl);
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
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: `Crawl failed: ${message}`, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw err;
  }

  await db.update(agentJobs).set({ progress: 60 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(60);

  // Run LLM analysis via WebsiteAnalyzerAgent
  const agent = new WebsiteAnalyzerAgent(config);
  const result = await agent.execute({
    clientId,
    agentType: "website_analyzer",
    params: { websiteUrl: client.websiteUrl, crawledPages },
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

  // Write KB sections to database
  const sections = (result.data?.sections ?? []) as KnowledgeBaseSection[];
  for (let i = 0; i < sections.length; i++) {
    await upsertKbSection(clientId, sections[i], i);
  }

  // Mark complete
  await db
    .update(agentJobs)
    .set({
      status: "completed",
      progress: 100,
      completedAt: new Date(),
      outputData: {
        sectionsWritten: sections.length,
        pagesAnalysed: crawledPages.length,
      },
      tokensUsed: result.tokensUsed ?? null,
    })
    .where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(100);
}
