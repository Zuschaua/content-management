import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(1).max(255),
  websiteUrl: z.string().url().max(2048),
  niche: z.string().max(255).optional(),
  industry: z.string().max(255).optional(),
  contactInfo: z
    .object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

export const updateClientSchema = createClientSchema.partial().extend({
  active: z.boolean().optional(),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const articleStatusValues = [
  "suggested",
  "approved",
  "writing",
  "written",
  "proofreading",
  "ready",
] as const;

type ArticleStatus = (typeof articleStatusValues)[number];

export const validTransitions: Record<ArticleStatus, ArticleStatus[]> = {
  suggested: ["approved"],
  approved: ["writing", "suggested"],
  writing: ["written"],
  written: ["proofreading", "approved"],
  proofreading: ["ready", "written"],
  ready: [],
};

export function canTransition(
  from: ArticleStatus,
  to: ArticleStatus
): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}

export const agentTypeValues = [
  "website_analyzer",
  "blog_tracker",
  "competitor_analyzer",
  "suggestion_engine",
  "article_writer",
  "image_generator",
] as const;

export const modelProviderValues = ["openai", "anthropic", "google", "custom"] as const;

export const createAgentConfigSchema = z.object({
  agentType: z.enum(agentTypeValues),
  clientId: z.string().uuid().optional(),
  displayName: z.string().min(1).max(255),
  systemPrompt: z.string().min(1),
  modelProvider: z.string().min(1).max(100),
  modelName: z.string().min(1).max(100),
  baseUrl: z.string().url().max(2048).optional(),
  apiKey: z.string().max(512).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  extraConfig: z.record(z.unknown()).optional(),
});

export const updateAgentConfigSchema = createAgentConfigSchema
  .omit({ agentType: true, clientId: true })
  .partial();

export const rollbackPromptSchema = z.object({
  version: z.number().int().positive(),
});

// --- Knowledge Base ---

export const kbSectionTypeValues = [
  "niche_overview",
  "products_services",
  "target_audience",
  "competitors",
  "content_gaps",
  "what_works",
  "custom",
] as const;

export const changeSourceValues = ["human", "agent"] as const;

export const createKbSectionSchema = z.object({
  sectionType: z.enum(kbSectionTypeValues),
  title: z.string().min(1).max(255),
  content: z.string(),
  sortOrder: z.number().int().min(0).optional(),
  sourceAgent: z.string().max(100).optional(),
});

export const updateKbSectionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const revertKbSectionSchema = z.object({
  version: z.number().int().positive(),
});

// --- Articles ---

export const contentFormatValues = [
  "how_to",
  "listicle",
  "deep_dive",
  "comparison",
  "general",
] as const;

export const sectionTypeValues = [
  "intro",
  "heading",
  "subheading",
  "conclusion",
] as const;

export const createArticleSchema = z.object({
  title: z.string().min(1).max(500),
  contentFormat: z.enum(contentFormatValues).optional(),
  targetKeywords: z.array(z.string()).optional(),
  wordCountTarget: z.number().int().positive().optional(),
  metaDescription: z.string().optional(),
  outline: z.record(z.unknown()).optional(),
  strategicRationale: z.string().optional(),
  scheduledDate: z.string().optional(),
});

export const updateArticleSchema = createArticleSchema.partial().extend({
  slug: z.string().max(500).optional(),
  body: z.string().optional(),
  wordCountActual: z.number().int().nonnegative().optional(),
  assignedModel: z.string().max(100).optional(),
});

export const transitionArticleStatusSchema = z.object({
  status: z.enum(articleStatusValues),
});

export const createArticleSectionSchema = z.object({
  heading: z.string().min(1).max(500),
  body: z.string(),
  sortOrder: z.number().int().nonnegative(),
  sectionType: z.enum(sectionTypeValues).optional(),
});

export const updateArticleSectionSchema = createArticleSectionSchema.partial();
