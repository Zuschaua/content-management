import type { Job } from "bullmq";
import { CheerioCrawler, EnqueueStrategy } from "crawlee";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  agentJobs,
  clients,
  crawlJobs,
  existingBlogArticles,
  knowledgeBaseSections,
} from "../db/schema.js";
import { resolveConfig } from "../services/agent-config.service.js";
import { BlogTrackerAgent } from "@content-factory/agents";
import type { BlogAnalysis, BlogArticleData, CrawledBlogPost } from "@content-factory/agents";

export interface TrackBlogJobData {
  agentJobId: string;
  clientId: string;
}

const MAX_POSTS = 50;
const MAX_CONTENT_CHARS = 6000;

/**
 * Heuristic: a URL is likely a blog post if it has a date segment or is under a
 * blog/news/articles path, and is not the blog index itself.
 */
function isBlogPostUrl(url: string, blogUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const blogParsed = new URL(blogUrl);

    // Must be same origin
    if (parsed.hostname !== blogParsed.hostname) return false;

    const path = parsed.pathname.toLowerCase();

    // Skip the root blog index page itself
    if (path === blogParsed.pathname.toLowerCase()) return false;

    // Skip common non-post pages
    const skip = ["/tag/", "/category/", "/author/", "/page/", "/feed", "?", "#"];
    if (skip.some((s) => path.includes(s) || parsed.search.includes(s))) return false;

    // Prefer paths with date segments (YYYY/MM or YYYY-MM) or blog subpaths
    const hasBlogPath =
      /\/(blog|news|articles?|posts?|insights?|resources?)\//i.test(path);
    const hasDateSegment = /\/\d{4}\/\d{2}\//.test(path);
    const hasSlug = path.split("/").filter(Boolean).length >= 2;

    return hasBlogPath || hasDateSegment || hasSlug;
  } catch {
    return false;
  }
}

/**
 * Rough word count from text content.
 */
function estimateWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Try to extract a publish date from common meta tags or structured data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPublishDate($: any): string | undefined {
  const candidates = [
    $('meta[property="article:published_time"]').attr("content"),
    $('meta[name="date"]').attr("content"),
    $('meta[name="DC.date.issued"]').attr("content"),
    $('time[datetime]').first().attr("datetime"),
    $('[itemprop="datePublished"]').first().attr("content"),
  ];

  for (const c of candidates) {
    if (c) {
      const parsed = new Date(c);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split("T")[0];
      }
    }
  }
  return undefined;
}

/**
 * Crawls a client blog URL using CheerioCrawler.
 * Stays on the same domain, prefers blog-post-like URLs.
 * Returns extracted post content.
 */
async function crawlBlog(blogUrl: string): Promise<CrawledBlogPost[]> {
  const posts: CrawledBlogPost[] = [];

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: MAX_POSTS + 10, // slight buffer for index pages
    async requestHandler({ $, request, enqueueLinks }) {
      const url = request.url;

      // Always enqueue links to discover posts
      await enqueueLinks({ strategy: EnqueueStrategy.SameDomain });

      // Only index pages that look like blog posts
      if (!isBlogPostUrl(url, blogUrl)) return;

      const title =
        $("h1").first().text().trim() ||
        $("title").first().text().trim() ||
        url;

      const contentParts: string[] = [];
      $("h1, h2, h3, h4, p, li").each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (text.length > 20) {
          contentParts.push(text);
        }
      });

      const rawText = contentParts.join("\n");
      const content = rawText.slice(0, MAX_CONTENT_CHARS);

      if (content.length < 100) return;

      const publishDate = extractPublishDate($);
      const estimatedWordCount = estimateWordCount(rawText);

      posts.push({ url, title, content, publishDate, estimatedWordCount });
    },
  });

  await crawler.run([blogUrl]);
  return posts.slice(0, MAX_POSTS);
}

/**
 * Upsert a single blog article record (insert on first crawl, update on re-crawl).
 */
async function upsertBlogArticle(
  clientId: string,
  article: BlogArticleData
): Promise<void> {
  const existing = await db
    .select({ id: existingBlogArticles.id })
    .from(existingBlogArticles)
    .where(
      and(
        eq(existingBlogArticles.clientId, clientId),
        eq(existingBlogArticles.url, article.url)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(existingBlogArticles)
      .set({
        title: article.title,
        topics: article.topics,
        keywords: article.keywords,
        ...(article.publishDate ? { publishDate: article.publishDate } : {}),
        ...(article.estimatedWordCount
          ? { estimatedWordCount: article.estimatedWordCount }
          : {}),
        lastCrawledAt: new Date(),
      })
      .where(eq(existingBlogArticles.id, existing[0].id));
  } else {
    await db.insert(existingBlogArticles).values({
      clientId,
      url: article.url,
      title: article.title,
      topics: article.topics,
      keywords: article.keywords,
      ...(article.publishDate ? { publishDate: article.publishDate } : {}),
      ...(article.estimatedWordCount
        ? { estimatedWordCount: article.estimatedWordCount }
        : {}),
      lastCrawledAt: new Date(),
    });
  }
}

/**
 * Upsert a KB section (what_works or content_gaps) for a client.
 */
async function upsertKbSection(
  clientId: string,
  sectionType: "what_works" | "content_gaps",
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
        sourceAgent: "blog_tracker",
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
      sourceAgent: "blog_tracker",
      sortOrder,
    });
  }
}

/**
 * BullMQ job processor for the "track-blog" job.
 *
 * Progress milestones:
 *   10 — started, client loaded
 *   20 — agent config resolved
 *   30 — crawl starting
 *   60 — crawl complete
 *   80 — LLM analysis complete
 *  100 — articles + KB sections written, done
 */
export async function processTrackBlogJob(job: Job<TrackBlogJobData>): Promise<void> {
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
  const config = await resolveConfig("blog_tracker", clientId);
  if (!config) {
    const msg = `No agent config found for blog_tracker. Create a global config at POST /api/v1/agent-configs/global.`;
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  await db.update(agentJobs).set({ progress: 20 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(20);

  // Use websiteUrl as the blog entry point (crawl will discover blog posts)
  const blogUrl = client.websiteUrl;

  // Create crawl_jobs tracking record
  const [crawlJobRow] = await db
    .insert(crawlJobs)
    .values({
      clientId,
      jobType: "blog_tracking",
      targetUrl: blogUrl,
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: crawlJobs.id });

  await db.update(agentJobs).set({ progress: 30 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(30);

  // Crawl the blog
  let crawledPosts: CrawledBlogPost[];
  try {
    crawledPosts = await crawlBlog(blogUrl);
    await db
      .update(crawlJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        resultSummary: { postCount: crawledPosts.length },
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

  // Run LLM analysis via BlogTrackerAgent
  const agent = new BlogTrackerAgent(config);
  const result = await agent.execute({
    clientId,
    agentType: "blog_tracker",
    params: { blogUrl, crawledPosts },
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

  const analysis = result.data?.analysis as BlogAnalysis;
  const articles = (result.data?.articles ?? []) as BlogArticleData[];

  // Upsert each discovered blog article
  for (const article of articles) {
    await upsertBlogArticle(clientId, article);
  }

  // Write KB sections
  await upsertKbSection(clientId, "what_works", analysis.whatWorks.title, analysis.whatWorks.content, 10);
  await upsertKbSection(clientId, "content_gaps", analysis.contentGaps.title, analysis.contentGaps.content, 11);

  // Mark complete
  await db
    .update(agentJobs)
    .set({
      status: "completed",
      progress: 100,
      completedAt: new Date(),
      outputData: {
        articlesIndexed: articles.length,
        postsCrawled: crawledPosts.length,
        kbSectionsWritten: 2,
      },
      tokensUsed: result.tokensUsed ?? null,
    })
    .where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(100);
}
