export type UserRole = "admin" | "editor" | "writer";

export type AgentType =
  | "website_analyzer"
  | "blog_tracker"
  | "competitor_analyzer"
  | "suggestion_engine"
  | "article_writer"
  | "image_generator";

export type ArticleStatus =
  | "suggested"
  | "approved"
  | "writing"
  | "written"
  | "proofreading"
  | "ready";

export type ContentFormat =
  | "how_to"
  | "listicle"
  | "deep_dive"
  | "comparison"
  | "general";

export interface Client {
  id: string;
  name: string;
  websiteUrl: string;
  niche?: string;
  industry?: string;
  contactInfo?: {
    email?: string;
    phone?: string;
    notes?: string;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Article {
  id: string;
  clientId: string;
  title: string;
  slug?: string;
  status: ArticleStatus;
  contentFormat?: ContentFormat;
  targetKeywords?: string[];
  wordCountTarget?: number;
  wordCountActual?: number;
  metaDescription?: string;
  outline?: Record<string, unknown>;
  strategicRationale?: string;
  body?: string;
  scheduledDate?: string;
  assignedModel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  id: string;
  agentType: AgentType;
  clientId?: string | null;
  displayName: string;
  systemPrompt: string;
  modelProvider: string;
  modelName: string;
  baseUrl?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  extraConfig?: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPromptVersion {
  id: string;
  agentConfigId: string;
  version: number;
  systemPrompt: string;
  changedBy?: string | null;
  createdAt: string;
}
