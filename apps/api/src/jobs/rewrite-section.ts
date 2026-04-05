import type { Job } from "bullmq";
import { eq, and, max } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  agentJobs,
  articles,
  articleSections,
  articleVersions,
  knowledgeBaseSections,
} from "../db/schema.js";
import { resolveConfig } from "../services/agent-config.service.js";
import { ArticleWriterAgent } from "@content-factory/agents";

export interface RewriteSectionJobData {
  agentJobId: string;
  clientId: string;
  articleId: string;
  sectionId: string;
  instructions?: string;
}

/**
 * BullMQ job processor for the "rewrite-section" job.
 *
 * Progress milestones:
 *   10 — started, article + section loaded
 *   50 — LLM rewrite in progress
 *   90 — DB writes complete
 *  100 — done
 */
export async function processRewriteSectionJob(
  job: Job<RewriteSectionJobData>
): Promise<void> {
  const { agentJobId, clientId, articleId, sectionId, instructions } = job.data;

  // Mark job as running
  await db
    .update(agentJobs)
    .set({ status: "running", startedAt: new Date(), progress: 5 })
    .where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(5);

  // Load article
  const articleRows = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.clientId, clientId)))
    .limit(1);

  if (articleRows.length === 0) {
    const msg = `Article ${articleId} not found for client ${clientId}`;
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  const article = articleRows[0];

  // Load the section
  const sectionRows = await db
    .select()
    .from(articleSections)
    .where(and(eq(articleSections.id, sectionId), eq(articleSections.articleId, articleId)))
    .limit(1);

  if (sectionRows.length === 0) {
    const msg = `Section ${sectionId} not found for article ${articleId}`;
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  const section = sectionRows[0];

  // Resolve agent config
  const config = await resolveConfig("article_writer", clientId);
  if (!config) {
    const msg =
      "No agent config found for article_writer. Create a global config at POST /api/v1/agent-configs/global.";
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  await db.update(agentJobs).set({ progress: 10 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(10);

  // Load KB context
  const kbSections = await db
    .select({
      sectionType: knowledgeBaseSections.sectionType,
      content: knowledgeBaseSections.content,
    })
    .from(knowledgeBaseSections)
    .where(eq(knowledgeBaseSections.clientId, clientId));

  const clientContext = {
    nicheOverview: kbSections.find((s) => s.sectionType === "niche_overview")?.content,
    productsServices: kbSections.find((s) => s.sectionType === "products_services")?.content,
    targetAudience: kbSections.find((s) => s.sectionType === "target_audience")?.content,
    competitors: kbSections.find((s) => s.sectionType === "competitors")?.content,
    contentGaps: kbSections.find((s) => s.sectionType === "content_gaps")?.content,
    whatWorks: kbSections.find((s) => s.sectionType === "what_works")?.content,
  };

  await db.update(agentJobs).set({ progress: 50 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(50);

  // Rewrite the section
  const agent = new ArticleWriterAgent(config);
  const rewriteResult = await agent.rewriteSection({
    heading: section.heading,
    currentBody: section.body,
    title: article.title,
    contentFormat: article.contentFormat ?? "general",
    targetKeywords: article.targetKeywords ?? [],
    clientContext,
    instructions,
  });

  if (!rewriteResult.success) {
    const msg = rewriteResult.error ?? "Section rewrite failed";
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  // Update the section
  await db
    .update(articleSections)
    .set({ body: rewriteResult.body!, updatedAt: new Date() })
    .where(eq(articleSections.id, sectionId));

  // Re-assemble full body from all sections (ordered by sortOrder)
  const allSections = await db
    .select({ heading: articleSections.heading, body: articleSections.body })
    .from(articleSections)
    .where(eq(articleSections.articleId, articleId))
    .orderBy(articleSections.sortOrder);

  const fullBody = allSections
    .map((s) => `## ${s.heading}\n\n${s.body}`)
    .join("\n\n");

  const totalWordCount = fullBody.split(/\s+/).filter(Boolean).length;

  // Update article body
  await db
    .update(articles)
    .set({
      body: fullBody,
      wordCountActual: totalWordCount,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId));

  // Create article version
  const maxVersionResult = await db
    .select({ maxVersion: max(articleVersions.version) })
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId));

  const nextVersion = (maxVersionResult[0]?.maxVersion ?? 0) + 1;

  await db.insert(articleVersions).values({
    articleId,
    version: nextVersion,
    body: fullBody,
    changeSource: "agent",
    changeNote: `Section rewrite: ${section.heading}`,
  });

  await db.update(agentJobs).set({ progress: 90 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(90);

  // Mark job completed — no status transition for rewrites
  await db
    .update(agentJobs)
    .set({
      status: "completed",
      progress: 100,
      completedAt: new Date(),
      outputData: {
        sectionRewritten: section.heading,
        newWordCount: rewriteResult.wordCount,
        totalWordCount,
        version: nextVersion,
      },
      tokensUsed: rewriteResult.tokensUsed ?? null,
    })
    .where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(100);
}
