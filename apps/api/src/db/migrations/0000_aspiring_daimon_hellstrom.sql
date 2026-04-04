CREATE TYPE "public"."agent_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('website_analyzer', 'blog_tracker', 'competitor_analyzer', 'suggestion_engine', 'article_writer', 'image_generator');--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('suggested', 'approved', 'writing', 'written', 'proofreading', 'ready');--> statement-breakpoint
CREATE TYPE "public"."change_source" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."content_format" AS ENUM('how_to', 'listicle', 'deep_dive', 'comparison', 'general');--> statement-breakpoint
CREATE TYPE "public"."crawl_job_type" AS ENUM('website_analysis', 'blog_tracking', 'competitor_analysis');--> statement-breakpoint
CREATE TYPE "public"."image_type" AS ENUM('featured', 'inline', 'custom');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."kb_section_type" AS ENUM('niche_overview', 'products_services', 'target_audience', 'competitors', 'content_gaps', 'what_works', 'custom');--> statement-breakpoint
CREATE TYPE "public"."section_type" AS ENUM('intro', 'heading', 'subheading', 'conclusion');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'writer');--> statement-breakpoint
CREATE TABLE "agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"client_id" uuid,
	"display_name" varchar(255) NOT NULL,
	"system_prompt" text NOT NULL,
	"model_provider" varchar(100) NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"base_url" varchar(2048),
	"api_key_encrypted" varchar(1024),
	"temperature" numeric(3, 2) DEFAULT '0.70',
	"max_tokens" integer,
	"extra_config" jsonb,
	"version" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"job_type" varchar(50) NOT NULL,
	"reference_id" uuid,
	"reference_type" varchar(50),
	"status" "agent_job_status" DEFAULT 'queued',
	"progress" integer DEFAULT 0,
	"input_data" jsonb,
	"output_data" jsonb,
	"error_message" text,
	"tokens_used" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_config_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"system_prompt" text NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "article_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"section_id" uuid,
	"user_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"resolved" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "article_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"image_type" "image_type",
	"prompt" text,
	"storage_path" varchar(2048) NOT NULL,
	"alt_text" varchar(500),
	"sort_order" integer DEFAULT 0,
	"is_ai_generated" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "article_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"heading" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"sort_order" integer NOT NULL,
	"section_type" "section_type",
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "article_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"change_source" "change_source" NOT NULL,
	"change_note" text,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"slug" varchar(500),
	"status" "article_status" DEFAULT 'suggested' NOT NULL,
	"content_format" "content_format",
	"target_keywords" text[],
	"word_count_target" integer,
	"word_count_actual" integer,
	"meta_description" text,
	"outline" jsonb,
	"strategic_rationale" text,
	"body" text,
	"scheduled_date" date,
	"assigned_model" varchar(100),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"website_url" varchar(2048) NOT NULL,
	"niche" varchar(255),
	"industry" varchar(255),
	"contact_info" jsonb,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "competitor_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"title" varchar(500),
	"topics" text[],
	"estimated_word_count" integer,
	"publish_date" date,
	"last_crawled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" varchar(255),
	"website_url" varchar(2048) NOT NULL,
	"is_ai_suggested" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crawl_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"job_type" "crawl_job_type" NOT NULL,
	"target_url" varchar(2048) NOT NULL,
	"status" "job_status" DEFAULT 'pending',
	"result_summary" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "existing_blog_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"title" varchar(500),
	"topics" text[],
	"keywords" text[],
	"publish_date" date,
	"estimated_word_count" integer,
	"last_crawled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"section_type" "kb_section_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"source_agent" varchar(100),
	"sort_order" integer DEFAULT 0,
	"version" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"changed_by" uuid,
	"change_source" "change_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompt_versions" ADD CONSTRAINT "agent_prompt_versions_agent_config_id_agent_configs_id_fk" FOREIGN KEY ("agent_config_id") REFERENCES "public"."agent_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompt_versions" ADD CONSTRAINT "agent_prompt_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_section_id_article_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."article_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_images" ADD CONSTRAINT "article_images_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_sections" ADD CONSTRAINT "article_sections_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_content" ADD CONSTRAINT "competitor_content_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "existing_blog_articles" ADD CONSTRAINT "existing_blog_articles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_embeddings" ADD CONSTRAINT "knowledge_base_embeddings_section_id_knowledge_base_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."knowledge_base_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_sections" ADD CONSTRAINT "knowledge_base_sections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_versions" ADD CONSTRAINT "knowledge_base_versions_section_id_knowledge_base_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."knowledge_base_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_versions" ADD CONSTRAINT "knowledge_base_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_config_unique" ON "agent_configs" USING btree ("agent_type","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_prompt_version_unique" ON "agent_prompt_versions" USING btree ("agent_config_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "article_version_unique" ON "article_versions" USING btree ("article_id","version");--> statement-breakpoint
CREATE INDEX "articles_client_status" ON "articles" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "articles_client_date" ON "articles" USING btree ("client_id","scheduled_date");--> statement-breakpoint
CREATE UNIQUE INDEX "existing_blog_unique" ON "existing_blog_articles" USING btree ("client_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_embedding_unique" ON "knowledge_base_embeddings" USING btree ("section_id","chunk_index");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_version_unique" ON "knowledge_base_versions" USING btree ("section_id","version");