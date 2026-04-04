import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  date,
  decimal,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "editor", "writer"]);

export const kbSectionTypeEnum = pgEnum("kb_section_type", [
  "niche_overview",
  "products_services",
  "target_audience",
  "competitors",
  "content_gaps",
  "what_works",
  "custom",
]);

export const changeSourceEnum = pgEnum("change_source", ["human", "agent"]);

export const articleStatusEnum = pgEnum("article_status", [
  "suggested",
  "approved",
  "writing",
  "written",
  "proofreading",
  "ready",
]);

export const contentFormatEnum = pgEnum("content_format", [
  "how_to",
  "listicle",
  "deep_dive",
  "comparison",
  "general",
]);

export const imageTypeEnum = pgEnum("image_type", [
  "featured",
  "inline",
  "custom",
]);

export const crawlJobTypeEnum = pgEnum("crawl_job_type", [
  "website_analysis",
  "blog_tracking",
  "competitor_analysis",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const agentTypeEnum = pgEnum("agent_type", [
  "website_analyzer",
  "blog_tracker",
  "competitor_analyzer",
  "suggestion_engine",
  "article_writer",
  "image_generator",
]);

export const agentJobStatusEnum = pgEnum("agent_job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const sectionTypeEnum = pgEnum("section_type", [
  "intro",
  "heading",
  "subheading",
  "conclusion",
]);

// Tables
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("editor"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  websiteUrl: varchar("website_url", { length: 2048 }).notNull(),
  niche: varchar("niche", { length: 255 }),
  industry: varchar("industry", { length: 255 }),
  contactInfo: jsonb("contact_info"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const knowledgeBaseSections = pgTable("knowledge_base_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  sectionType: kbSectionTypeEnum("section_type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  sourceAgent: varchar("source_agent", { length: 100 }),
  sortOrder: integer("sort_order").default(0),
  version: integer("version").default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const knowledgeBaseVersions = pgTable(
  "knowledge_base_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => knowledgeBaseSections.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    changedBy: uuid("changed_by").references(() => users.id),
    changeSource: changeSourceEnum("change_source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("kb_version_unique").on(table.sectionId, table.version)]
);

export const knowledgeBaseEmbeddings = pgTable(
  "knowledge_base_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => knowledgeBaseSections.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("kb_embedding_unique").on(table.sectionId, table.chunkIndex)]
);

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    slug: varchar("slug", { length: 500 }),
    status: articleStatusEnum("status").notNull().default("suggested"),
    contentFormat: contentFormatEnum("content_format"),
    targetKeywords: text("target_keywords").array(),
    wordCountTarget: integer("word_count_target"),
    wordCountActual: integer("word_count_actual"),
    metaDescription: text("meta_description"),
    outline: jsonb("outline"),
    strategicRationale: text("strategic_rationale"),
    body: text("body"),
    scheduledDate: date("scheduled_date"),
    assignedModel: varchar("assigned_model", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("articles_client_status").on(table.clientId, table.status),
    index("articles_client_date").on(table.clientId, table.scheduledDate),
  ]
);

export const articleVersions = pgTable(
  "article_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    changeSource: changeSourceEnum("change_source").notNull(),
    changeNote: text("change_note"),
    changedBy: uuid("changed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("article_version_unique").on(table.articleId, table.version)]
);

export const articleSections = pgTable("article_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  heading: varchar("heading", { length: 500 }).notNull(),
  body: text("body").notNull(),
  sortOrder: integer("sort_order").notNull(),
  sectionType: sectionTypeEnum("section_type"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const articleComments = pgTable("article_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id").references(() => articleSections.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  comment: text("comment").notNull(),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const articleImages = pgTable("article_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  imageType: imageTypeEnum("image_type"),
  prompt: text("prompt"),
  storagePath: varchar("storage_path", { length: 2048 }).notNull(),
  altText: varchar("alt_text", { length: 500 }),
  sortOrder: integer("sort_order").default(0),
  isAiGenerated: boolean("is_ai_generated").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const crawlJobs = pgTable("crawl_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  jobType: crawlJobTypeEnum("job_type").notNull(),
  targetUrl: varchar("target_url", { length: 2048 }).notNull(),
  status: jobStatusEnum("status").default("pending"),
  resultSummary: jsonb("result_summary"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const existingBlogArticles = pgTable(
  "existing_blog_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 2048 }).notNull(),
    title: varchar("title", { length: 500 }),
    topics: text("topics").array(),
    keywords: text("keywords").array(),
    publishDate: date("publish_date"),
    estimatedWordCount: integer("estimated_word_count"),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("existing_blog_unique").on(table.clientId, table.url)]
);

export const competitors = pgTable("competitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }),
  websiteUrl: varchar("website_url", { length: 2048 }).notNull(),
  isAiSuggested: boolean("is_ai_suggested").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const competitorContent = pgTable("competitor_content", {
  id: uuid("id").primaryKey().defaultRandom(),
  competitorId: uuid("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 2048 }).notNull(),
  title: varchar("title", { length: 500 }),
  topics: text("topics").array(),
  estimatedWordCount: integer("estimated_word_count"),
  publishDate: date("publish_date"),
  lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const agentConfigs = pgTable(
  "agent_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentType: agentTypeEnum("agent_type").notNull(),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    systemPrompt: text("system_prompt").notNull(),
    modelProvider: varchar("model_provider", { length: 100 }).notNull(),
    modelName: varchar("model_name", { length: 100 }).notNull(),
    baseUrl: varchar("base_url", { length: 2048 }),
    apiKeyEncrypted: varchar("api_key_encrypted", { length: 1024 }),
    temperature: decimal("temperature", { precision: 3, scale: 2 }).default(
      "0.70"
    ),
    maxTokens: integer("max_tokens"),
    extraConfig: jsonb("extra_config"),
    version: integer("version").default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("agent_config_unique").on(table.agentType, table.clientId)]
);

export const agentPromptVersions = pgTable(
  "agent_prompt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentConfigId: uuid("agent_config_id")
      .notNull()
      .references(() => agentConfigs.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    changedBy: uuid("changed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_prompt_version_unique").on(
      table.agentConfigId,
      table.version
    ),
  ]
);

export const agentJobs = pgTable("agent_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  agentType: varchar("agent_type", { length: 50 }).notNull(),
  jobType: varchar("job_type", { length: 50 }).notNull(),
  referenceId: uuid("reference_id"),
  referenceType: varchar("reference_type", { length: 50 }),
  status: agentJobStatusEnum("status").default("queued"),
  progress: integer("progress").default(0),
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  errorMessage: text("error_message"),
  tokensUsed: integer("tokens_used"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
