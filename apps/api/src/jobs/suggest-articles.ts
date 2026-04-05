import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  agentJobs,
  clients,
  articles,
  knowledgeBaseSections,
  existingBlogArticles,
} from "../db/schema.js";
import { resolveConfig } from "../services/agent-config.service.js";
import { ArticleSuggesterAgent } from "@content-factory/agents";
import type { ArticleSuggesterOutput } from "@content-factory/agents";

export interface SuggestArticlesJobData {
  agentJobId: string;
  clientId: string;
  count: number;
  preferences?: string;
}

/**
 * BullMQ job processor for the "suggest-articles" job.
 *
 * Progress milestones:
 *   10 — started, client + config loaded
 *   30 — KB context and existing articles loaded
 *   50 — LLM suggestion generation started
 *   80 — LLM complete, writing to DB
 *  100 — done
 */
export async function processSuggestArticlesJob(
  job: Job<SuggestArticlesJobData>
): Promise<void> {
  const { agentJobId, clientId, count, preferences } = job.data;

  // Mark job as running
  await db
    .update(agentJobs)
    .set({ status: "running", startedAt: new Date(), progress: 10 })
    .where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(10);

  // Load client
  const clientRows = await db
    .select({ id: clients.id, name: clients.name })
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
  const config = await resolveConfig("suggestion_engine", clientId);
  if (!config) {
    const msg =
      "No agent config found for suggestion_engine. Create a global config at POST /api/v1/agent-configs/global.";
    await db
      .update(agentJobs)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(agentJobs.id, agentJobId));
    throw new Error(msg);
  }

  // Load KB context
  const kbSections = await db
    .select({
      sectionType: knowledgeBaseSections.sectionType,
      content: knowledgeBaseSections.content,
    })
    .from(knowledgeBaseSections)
    .where(eq(knowledgeBaseSections.clientId, clientId));

  // Load existing blog articles for deduplication
  const existingRows = await db
    .select({
      title: existingBlogArticles.title,
      topics: existingBlogArticles.topics,
      keywords: existingBlogArticles.keywords,
    })
    .from(existingBlogArticles)
    .where(eq(existingBlogArticles.clientId, clientId))
    .limit(300);

  // Also load any already-suggested/approved articles to avoid duplicating pipeline entries
  const suggestedRows = await db
    .select({ title: articles.title, targetKeywords: articles.targetKeywords })
    .from(articles)
    .where(eq(articles.clientId, clientId));

  const existingArticles = [
    ...existingRows.map((r) => ({
      title: r.title ?? "",
      topics: r.topics ?? [],
      keywords: r.keywords ?? [],
    })),
    ...suggestedRows.map((r) => ({
      title: r.title,
      topics: [] as string[],
      keywords: r.targetKeywords ?? [],
    })),
  ].filter((a) => a.title.length > 0);

  const clientContext = {
    nicheOverview: kbSections.find((s) => s.sectionType === "niche_overview")?.content,
    productsServices: kbSections.find((s) => s.sectionType === "products_services")?.content,
    targetAudience: kbSections.find((s) => s.sectionType === "target_audience")?.content,
    competitors: kbSections.find((s) => s.sectionType === "competitors")?.content,
    contentGaps: kbSections.find((s) => s.sectionType === "content_gaps")?.content,
    whatWorks: kbSections.find((s) => s.sectionType === "what_works")?.content,
  };

  await db.update(agentJobs).set({ progress: 30 }).where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(30);

  // Run LLM suggestion engine
  const agent = new ArticleSuggesterAgent(config);
  const result = await agent.execute({
    clientId,
    agentType: "suggestion_engine",
    params: { count, preferences, clientContext, existingArticles },
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

  const output = result.data as unknown as ArticleSuggesterOutput;

  // Insert suggested articles into the articles table
  for (const suggestion of output.suggestions) {
    await db.insert(articles).values({
      clientId,
      title: suggestion.title,
      status: "suggested",
      contentFormat: suggestion.contentFormat,
      targetKeywords: suggestion.targetKeywords,
      wordCountTarget: suggestion.wordCountTarget,
      outline: suggestion.outline as Record<string, unknown>,
      strategicRationale: suggestion.strategicRationale,
      seoScore: suggestion.seoScore,
    });
  }

  // Mark complete
  await db
    .update(agentJobs)
    .set({
      status: "completed",
      progress: 100,
      completedAt: new Date(),
      outputData: {
        suggestionsCreated: output.suggestions.length,
        existingArticlesChecked: existingArticles.length,
      },
      tokensUsed: result.tokensUsed ?? null,
    })
    .where(eq(agentJobs.id, agentJobId));
  await job.updateProgress(100);
}
