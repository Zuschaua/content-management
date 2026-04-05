import type { ArticleStatus } from "./index.js";

export type PipelineStats = Record<ArticleStatus, number> & { total: number };

export interface ActivityEvent {
  type:
    | "article_transition"
    | "job_completed"
    | "job_failed"
    | "article_created";
  articleId?: string;
  articleTitle?: string;
  clientName: string;
  fromStatus?: ArticleStatus;
  toStatus?: ArticleStatus;
  agentType?: string;
  timestamp: string;
}

export interface JobStatus {
  running: number;
  queued: number;
  failed: number;
  completedToday: number;
}

export interface ClientOverview {
  id: string;
  name: string;
  articleCount: number;
  readyCount: number;
  inProgressCount: number;
  kbComplete: boolean;
  lastActivityAt: string | null;
}

export interface DashboardStatsResponse {
  pipeline: PipelineStats;
  readyToExport: number;
  activeClients: number;
  recentActivity: ActivityEvent[];
  jobStatus: JobStatus;
  clientOverviews: ClientOverview[];
}
