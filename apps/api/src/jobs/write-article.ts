import type { Job } from "bullmq";
import { eq, and, max, sql } from "drizzle-orm";
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
import type { ArticleWriterOutput } from "@content-factory/agents";
import { canTransition } from "@content-factory/shared";

export interface WriteArticleJobData {
  agentJobId: string;
  clientId: string;
  articleId: string;
}

/**
 * BullMQ job processor for the "write-article" job.
 *
 * Progress milestones:
 *   10 — started, article + client + config loaded
 *   20 — KB context loaded
 *   25–75 — section-by-section generation
 *   80 — all sections written, assembling body
 *   90 — DB writes complete
 *   95 — article transitioned to written
 *  100 — job marked completed
 */
export async function processWriteArticleJob(
  job: Job<WriteArticleJobData>
): Promise<void> {
  const { agentJobId, clientId, articleId } = job.data;

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

  // Validate status — accept approved or writing (retry case)
  if (article.status !== "approved" && article.status !== "writing") {
    const msg = `Article status is "${article.status}" — expected "approved" or "writing"`;
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  // Validate outline
  const outline = article.outline as { sections?: string[] } | null;
  if (!outline?.sections?.length) {
    const msg = "Article has no outline sections — cannot generate content";
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  // Transition to writing if approved
  if (article.status === "approved") {
    if (!canTransition("approved", "writing")) {
      const msg = "Cannot transition article from approved to writing";
      await db
        .update(agentJobs)
        .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
        .where(eq(agentJobs.id, agentJobId));
      throw new Error(msg);
    }
    await db
      .update(articles)
      .set({ status: "writing", updatedAt: new Date() })
      .where(eq(articles.id, articleId));
  }

  // If retry (already writing), delete existing sections
  if (article.status === "writing") {
    await db.delete(articleSections).where(eq(articleSections.articleId, articleId));
  }

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

  await db.update(agentJobs).set({ progress: 20 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(20);

  // Run the agent
  const agent = new ArticleWriterAgent(config);
  const result = await agent.execute({
    clientId,
    agentType: "article_writer",
    params: {
      title: article.title,
      contentFormat: article.contentFormat ?? "general",
      targetKeywords: article.targetKeywords ?? [],
      wordCountTarget: article.wordCountTarget ?? 1500,
      outline: { sections: outline.sections },
      clientContext,
    },
  });

  if (!result.success) {
    const msg = result.error ?? "Article writer agent returned failure";
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  await db.update(agentJobs).set({ progress: 80 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(80);

  const output = result.data as unknown as ArticleWriterOutput;

  // Insert article sections
  for (let i = 0; i < output.sections.length; i++) {
    const section = output.sections[i];
    await db.insert(articleSections).values({
      articleId,
      heading: section.heading,
      body: section.body,
      sortOrder: i,
      sectionType: section.sectionType,
    });
  }

  // Update article body, word count, and meta description
  await db
    .update(articles)
    .set({
      body: output.fullBody,
      wordCountActual: output.totalWordCount,
      metaDescription: output.metaDescription,
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
    body: output.fullBody,
    changeSource: "agent",
    changeNote: "Initial article draft by AI writer",
  });

  await db.update(agentJobs).set({ progress: 90 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(90);

  // Transition to written
  if (canTransition("writing", "written")) {
    await db
      .update(articles)
      .set({ status: "written", updatedAt: new Date() })
      .where(eq(articles.id, articleId));
  }

  await db.update(agentJobs).set({ progress: 95 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(95);

  // Mark job completed
  await db
    .update(agentJobs)
    .set({
      status: "completed",
      progress: 100,
      completedAt: new Date(),
      outputData: {
        sectionsWritten: output.sections.length,
        totalWordCount: output.totalWordCount,
        version: nextVersion,
      },
      tokensUsed: result.tokensUsed ?? null,
    })
    .where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(100);
}
