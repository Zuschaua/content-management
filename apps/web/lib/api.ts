const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "editor" | "writer";
};

export type Client = {
  id: string;
  name: string;
  websiteUrl: string;
  niche?: string | null;
  industry?: string | null;
  contactInfo?: { email?: string; phone?: string; notes?: string } | null;
  notes?: string | null;
  active: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateClientInput = {
  name: string;
  websiteUrl: string;
  niche?: string;
  industry?: string;
  contactInfo?: { email?: string; phone?: string; notes?: string };
  notes?: string;
};

export function getActiveClientId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("activeClientId");
}

export function setActiveClientId(clientId: string | null): void {
  if (typeof window === "undefined") return;
  if (clientId) {
    localStorage.setItem("activeClientId", clientId);
  } else {
    localStorage.removeItem("activeClientId");
  }
}

function clientHeaders(): Record<string, string> {
  const clientId = getActiveClientId();
  return clientId ? { "X-Client-Id": clientId } : {};
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...clientHeaders(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { status: res.status, body };
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getMe(): Promise<{ user: User } | null> {
  try {
    return await apiFetch<{ user: User }>("/api/v1/auth/me");
  } catch {
    return null;
  }
}

export async function login(
  email: string,
  password: string
): Promise<{ user: User }> {
  return apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<{ user: User }> {
  return apiFetch("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", { method: "POST" });
}

export async function listUsers(): Promise<{ users: User[] }> {
  return apiFetch("/api/v1/users");
}

export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role: User["role"];
}): Promise<{ user: User }> {
  return apiFetch("/api/v1/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  id: string,
  data: Partial<{ name: string; role: User["role"]; password: string }>
): Promise<{ user: User }> {
  return apiFetch(`/api/v1/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string): Promise<void> {
  await apiFetch(`/api/v1/users/${id}`, { method: "DELETE" });
}

// --- Client API ---

export async function listClients(): Promise<{ clients: Client[] }> {
  return apiFetch("/api/v1/clients");
}

export async function getClient(id: string): Promise<{ client: Client }> {
  return apiFetch(`/api/v1/clients/${id}`);
}

export async function createClient(
  data: CreateClientInput
): Promise<{ client: Client }> {
  return apiFetch("/api/v1/clients", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateClient(
  id: string,
  data: Partial<CreateClientInput>
): Promise<{ client: Client }> {
  return apiFetch(`/api/v1/clients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function archiveClient(id: string): Promise<void> {
  await apiFetch(`/api/v1/clients/${id}`, { method: "DELETE" });
}

// --- Agent Config API ---

export type AgentType =
  | "website_analyzer"
  | "blog_tracker"
  | "competitor_analyzer"
  | "suggestion_engine"
  | "article_writer"
  | "image_generator";

export type AgentConfig = {
  id: string;
  agentType: AgentType;
  clientId?: string | null;
  displayName: string;
  systemPrompt: string;
  modelProvider: string;
  modelName: string;
  baseUrl?: string | null;
  hasApiKey: boolean;
  temperature?: string | null;
  maxTokens?: number | null;
  extraConfig?: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentPromptVersion = {
  id: string;
  agentConfigId: string;
  version: number;
  systemPrompt: string;
  changedBy?: string | null;
  createdAt: string;
};

export type CreateAgentConfigInput = {
  agentType: AgentType;
  displayName: string;
  systemPrompt: string;
  modelProvider: string;
  modelName: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  extraConfig?: Record<string, unknown>;
};

export type UpdateAgentConfigInput = Partial<Omit<CreateAgentConfigInput, "agentType">>;

export async function listGlobalAgentConfigs(): Promise<{ configs: AgentConfig[] }> {
  return apiFetch("/api/v1/agent-configs/global");
}

export async function listClientAgentConfigs(
  clientId: string
): Promise<{ configs: AgentConfig[] }> {
  return apiFetch(`/api/v1/agent-configs/clients/${clientId}/agent-configs`);
}

export async function createGlobalAgentConfig(
  data: CreateAgentConfigInput
): Promise<{ config: AgentConfig }> {
  return apiFetch("/api/v1/agent-configs/global", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createClientAgentConfig(
  clientId: string,
  data: CreateAgentConfigInput
): Promise<{ config: AgentConfig }> {
  return apiFetch(`/api/v1/agent-configs/clients/${clientId}/agent-configs`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateAgentConfig(
  id: string,
  data: UpdateAgentConfigInput
): Promise<{ config: AgentConfig }> {
  return apiFetch(`/api/v1/agent-configs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteAgentConfig(id: string): Promise<void> {
  await apiFetch(`/api/v1/agent-configs/${id}`, { method: "DELETE" });
}

export async function listAgentConfigVersions(
  id: string
): Promise<{ versions: AgentPromptVersion[] }> {
  return apiFetch(`/api/v1/agent-configs/${id}/versions`);
}

export async function rollbackAgentConfig(
  id: string,
  version: number
): Promise<{ config: AgentConfig }> {
  return apiFetch(`/api/v1/agent-configs/${id}/rollback`, {
    method: "POST",
    body: JSON.stringify({ version }),
  });
}

// --- Knowledge Base API ---

export type KbSectionType =
  | "niche_overview"
  | "products_services"
  | "target_audience"
  | "competitors"
  | "content_gaps"
  | "what_works"
  | "custom";

export type KbSection = {
  id: string;
  clientId: string;
  sectionType: KbSectionType;
  title: string;
  content: string;
  sourceAgent?: string | null;
  sortOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type KbVersion = {
  id: string;
  sectionId: string;
  version: number;
  content: string;
  changedBy?: string | null;
  changeSource: "human" | "agent";
  createdAt: string;
};

export type CreateKbSectionInput = {
  sectionType: KbSectionType;
  title: string;
  content: string;
  sortOrder?: number;
  sourceAgent?: string;
};

export type UpdateKbSectionInput = {
  title?: string;
  content?: string;
  sortOrder?: number;
};

export async function listKbSections(
  clientId: string
): Promise<{ sections: KbSection[] }> {
  return apiFetch(`/api/v1/clients/${clientId}/knowledge-base`);
}

export async function getKbSection(
  clientId: string,
  sectionId: string
): Promise<{ section: KbSection }> {
  return apiFetch(`/api/v1/clients/${clientId}/knowledge-base/${sectionId}`);
}

export async function createKbSection(
  clientId: string,
  data: CreateKbSectionInput
): Promise<{ section: KbSection }> {
  return apiFetch(`/api/v1/clients/${clientId}/knowledge-base`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateKbSection(
  clientId: string,
  sectionId: string,
  data: UpdateKbSectionInput
): Promise<{ section: KbSection }> {
  return apiFetch(`/api/v1/clients/${clientId}/knowledge-base/${sectionId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteKbSection(
  clientId: string,
  sectionId: string
): Promise<void> {
  await apiFetch(`/api/v1/clients/${clientId}/knowledge-base/${sectionId}`, {
    method: "DELETE",
  });
}

export async function listKbVersions(
  clientId: string,
  sectionId: string
): Promise<{ versions: KbVersion[] }> {
  return apiFetch(
    `/api/v1/clients/${clientId}/knowledge-base/${sectionId}/versions`
  );
}

export async function revertKbSection(
  clientId: string,
  sectionId: string,
  version: number
): Promise<{ section: KbSection }> {
  return apiFetch(
    `/api/v1/clients/${clientId}/knowledge-base/${sectionId}/revert`,
    {
      method: "POST",
      body: JSON.stringify({ version }),
    }
  );
}

// --- Article API ---

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

export type SectionType = "intro" | "heading" | "subheading" | "conclusion";

export type Article = {
  id: string;
  clientId: string;
  title: string;
  slug?: string | null;
  status: ArticleStatus;
  contentFormat?: ContentFormat | null;
  targetKeywords?: string[] | null;
  wordCountTarget?: number | null;
  wordCountActual?: number | null;
  metaDescription?: string | null;
  outline?: Record<string, unknown> | null;
  strategicRationale?: string | null;
  body?: string | null;
  scheduledDate?: string | null;
  assignedModel?: string | null;
  seoScore?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ArticleSection = {
  id: string;
  articleId: string;
  heading: string;
  body: string;
  sortOrder: number;
  sectionType?: SectionType | null;
  updatedAt: string;
};

export type ArticleVersion = {
  id: string;
  articleId: string;
  version: number;
  body: string;
  changeSource: "human" | "agent";
  changeNote?: string | null;
  changedBy?: string | null;
  createdAt: string;
};

export type CreateArticleInput = {
  title: string;
  contentFormat?: ContentFormat;
  targetKeywords?: string[];
  wordCountTarget?: number;
  metaDescription?: string;
  outline?: Record<string, unknown>;
  strategicRationale?: string;
  scheduledDate?: string;
  seoScore?: number;
};

export type UpdateArticleInput = Partial<
  CreateArticleInput & {
    slug: string;
    body: string;
    wordCountActual: number;
    assignedModel: string;
  }
>;

export async function listArticles(
  clientId: string,
  opts?: { status?: ArticleStatus; sort?: string }
): Promise<{ articles: Article[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.sort) params.set("sort", opts.sort);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch(`/api/v1/clients/${clientId}/articles${qs}`);
}

export async function getArticle(
  clientId: string,
  articleId: string
): Promise<{ article: Article; sections: ArticleSection[] }> {
  return apiFetch(`/api/v1/clients/${clientId}/articles/${articleId}`);
}

export async function createArticle(
  clientId: string,
  data: CreateArticleInput
): Promise<{ article: Article }> {
  return apiFetch(`/api/v1/clients/${clientId}/articles`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateArticle(
  clientId: string,
  articleId: string,
  data: UpdateArticleInput
): Promise<{ article: Article }> {
  return apiFetch(`/api/v1/clients/${clientId}/articles/${articleId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteArticle(
  clientId: string,
  articleId: string
): Promise<void> {
  await apiFetch(`/api/v1/clients/${clientId}/articles/${articleId}`, {
    method: "DELETE",
  });
}

export async function transitionArticle(
  clientId: string,
  articleId: string,
  status: ArticleStatus
): Promise<{ article: Article }> {
  return apiFetch(
    `/api/v1/clients/${clientId}/articles/${articleId}/transition`,
    {
      method: "POST",
      body: JSON.stringify({ status }),
    }
  );
}

export async function listArticleVersions(
  clientId: string,
  articleId: string
): Promise<{ versions: ArticleVersion[] }> {
  return apiFetch(
    `/api/v1/clients/${clientId}/articles/${articleId}/versions`
  );
}

export async function createArticleSection(
  clientId: string,
  articleId: string,
  data: {
    heading: string;
    body: string;
    sortOrder: number;
    sectionType?: SectionType;
  }
): Promise<{ section: ArticleSection }> {
  return apiFetch(`/api/v1/clients/${clientId}/articles/${articleId}/sections`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateArticleSection(
  clientId: string,
  articleId: string,
  sectionId: string,
  data: Partial<{
    heading: string;
    body: string;
    sortOrder: number;
    sectionType: SectionType;
  }>
): Promise<{ section: ArticleSection }> {
  return apiFetch(
    `/api/v1/clients/${clientId}/articles/${articleId}/sections/${sectionId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    }
  );
}

export async function deleteArticleSection(
  clientId: string,
  articleId: string,
  sectionId: string
): Promise<void> {
  await apiFetch(
    `/api/v1/clients/${clientId}/articles/${articleId}/sections/${sectionId}`,
    { method: "DELETE" }
  );
}

// --- Bulk Actions API ---

export async function bulkTransitionArticles(
  clientId: string,
  articleIds: string[],
  status: ArticleStatus
): Promise<{ transitioned: string[]; errors: Array<{ id: string; error: string }> }> {
  return apiFetch(`/api/v1/clients/${clientId}/articles/bulk-transition`, {
    method: "POST",
    body: JSON.stringify({ articleIds, status }),
  });
}

export async function bulkDismissArticles(
  clientId: string,
  articleIds: string[]
): Promise<{ dismissed: string[]; requestedCount: number; dismissedCount: number }> {
  return apiFetch(`/api/v1/clients/${clientId}/articles/bulk-dismiss`, {
    method: "DELETE",
    body: JSON.stringify({ articleIds }),
  });
}

// --- Suggestion Generation API ---

export type AgentJob = {
  id: string;
  clientId: string;
  agentType: string;
  jobType: string;
  status: string;
  progress: number;
  inputData?: Record<string, unknown> | null;
  outputData?: Record<string, unknown> | null;
  errorMessage?: string | null;
  tokensUsed?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function triggerAnalyzeWebsite(
  clientId: string
): Promise<{ agentJobId: string; message: string }> {
  return apiFetch(`/api/v1/clients/${clientId}/agents/analyze-website`, {
    method: "POST",
  });
}

export async function triggerSuggestions(
  clientId: string,
  count?: number,
  preferences?: string
): Promise<{ agentJobId: string; message: string }> {
  return apiFetch(`/api/v1/clients/${clientId}/agents/suggest-articles`, {
    method: "POST",
    body: JSON.stringify({ count: count ?? 5, preferences }),
  });
}

export async function getAgentJob(
  clientId: string,
  jobId: string
): Promise<{ job: AgentJob }> {
  return apiFetch(`/api/v1/clients/${clientId}/agents/jobs/${jobId}`);
}

export async function cancelAgentJob(
  clientId: string,
  jobId: string
): Promise<{ message: string; jobId: string }> {
  return apiFetch(`/api/v1/clients/${clientId}/agents/jobs/${jobId}/cancel`, {
    method: "POST",
  });
}

export async function retryAgentJob(
  clientId: string,
  jobId: string
): Promise<{ agentJobId: string; originalJobId: string; message: string }> {
  return apiFetch(`/api/v1/clients/${clientId}/agents/jobs/${jobId}/retry`, {
    method: "POST",
  });
}

// --- Calendar API ---

export async function getCalendar(
  clientId: string,
  month: string
): Promise<{ articles: Article[]; month: string }> {
  return apiFetch(`/api/v1/clients/${clientId}/calendar?month=${month}`);
}

// --- Dashboard API ---

export type DashboardStats = {
  activeClients: number;
  articlesInProgress: number;
  readyToExport: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch("/api/v1/dashboard/stats");
}

export async function scheduleArticle(
  clientId: string,
  articleId: string,
  scheduledDate: string | null
): Promise<{ article: Article }> {
  return updateArticle(clientId, articleId, {
    scheduledDate: scheduledDate ?? undefined,
  });
}
