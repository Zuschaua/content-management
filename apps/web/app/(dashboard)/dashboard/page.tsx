"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getDashboardStats,
  getActiveClientId,
  type DashboardStatsResponse,
} from "@/lib/api";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clientId = getActiveClientId() ?? undefined;

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDashboardStats(clientId);
      setStats(data);
    } catch {
      setError("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading && !stats) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error}</p>
          <button
            onClick={fetchStats}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Active Clients" value={String(stats.activeClients)} />
        <StatCard label="In Pipeline" value={String(stats.pipeline.total)} />
        <StatCard
          label="Ready to Export"
          value={String(stats.readyToExport)}
          highlight={stats.readyToExport > 0}
        />
      </div>

      {/* Pipeline Breakdown */}
      <PipelineBreakdown pipeline={stats.pipeline} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Job Status */}
        <JobStatusPanel jobStatus={stats.jobStatus} />

        {/* Activity Feed */}
        <ActivityFeed activity={stats.recentActivity} />
      </div>

      {/* Client Overview Cards (only when not scoped) */}
      {!clientId && stats.clientOverviews.length > 0 && (
        <ClientOverviewGrid overviews={stats.clientOverviews} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-6 shadow-sm ${
        highlight
          ? "bg-amber-50 border-amber-300"
          : "bg-white border-gray-200"
      }`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function PipelineBreakdown({
  pipeline,
}: {
  pipeline: DashboardStatsResponse["pipeline"];
}) {
  const stages: { key: keyof typeof pipeline; label: string; color: string }[] =
    [
      { key: "suggested", label: "Suggested", color: "bg-gray-400" },
      { key: "approved", label: "Approved", color: "bg-blue-400" },
      { key: "writing", label: "Writing", color: "bg-indigo-400" },
      { key: "written", label: "Written", color: "bg-purple-400" },
      { key: "proofreading", label: "Proofing", color: "bg-yellow-400" },
      { key: "ready", label: "Ready", color: "bg-green-400" },
    ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">
        Pipeline Breakdown
      </h2>
      {pipeline.total === 0 ? (
        <p className="text-sm text-gray-400">No articles in pipeline</p>
      ) : (
        <>
          {/* Bar */}
          <div className="flex h-6 rounded-lg overflow-hidden mb-4">
            {stages.map(
              (s) =>
                pipeline[s.key] > 0 && (
                  <div
                    key={s.key}
                    className={`${s.color} transition-all`}
                    style={{
                      width: `${(Number(pipeline[s.key]) / pipeline.total) * 100}%`,
                    }}
                  />
                )
            )}
          </div>
          {/* Labels */}
          <div className="flex flex-wrap gap-4">
            {stages.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-block w-3 h-3 rounded-full ${s.color}`}
                />
                <span className="text-gray-600">
                  {s.label}: {pipeline[s.key]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function JobStatusPanel({
  jobStatus,
}: {
  jobStatus: DashboardStatsResponse["jobStatus"];
}) {
  const items = [
    {
      label: "Running",
      value: jobStatus.running,
      color: "text-blue-600",
      dot: "bg-blue-500",
    },
    {
      label: "Queued",
      value: jobStatus.queued,
      color: "text-gray-600",
      dot: "bg-gray-400",
    },
    {
      label: "Failed",
      value: jobStatus.failed,
      color: "text-red-600",
      dot: "bg-red-500",
    },
    {
      label: "Done Today",
      value: jobStatus.completedToday,
      color: "text-green-600",
      dot: "bg-green-500",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">
        Agent Jobs (24h)
      </h2>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${item.dot}`}
              />
              <span className="text-sm text-gray-600">{item.label}</span>
            </div>
            <span className={`text-lg font-semibold ${item.color}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityFeed({
  activity,
}: {
  activity: DashboardStatsResponse["recentActivity"];
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">
        Recent Activity
      </h2>
      {activity.length === 0 ? (
        <p className="text-sm text-gray-400">No recent activity</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {activity.map((event, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <span className="mt-1 text-base">
                {event.type === "job_completed"
                  ? "\u2705"
                  : event.type === "job_failed"
                    ? "\u274C"
                    : event.type === "article_created"
                      ? "\u2728"
                      : "\u27A1\uFE0F"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-700 truncate">
                  {eventDescription(event)}
                </p>
                <p className="text-xs text-gray-400">
                  {event.clientName} &middot; {relativeTime(event.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientOverviewGrid({
  overviews,
}: {
  overviews: DashboardStatsResponse["clientOverviews"];
}) {
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">
        Client Overview
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {overviews.map((client) => (
          <div
            key={client.id}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
          >
            <h3 className="font-medium text-gray-900 truncate">
              {client.name}
            </h3>
            <div className="mt-2 space-y-1 text-sm text-gray-500">
              <p>
                {client.articleCount} article
                {client.articleCount !== 1 ? "s" : ""}
              </p>
              <p>{client.readyCount} ready</p>
              <p>{client.inProgressCount} in progress</p>
              <p>
                KB:{" "}
                <span
                  className={
                    client.kbComplete ? "text-green-600" : "text-red-500"
                  }
                >
                  {client.kbComplete ? "Complete" : "Incomplete"}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function eventDescription(
  event: DashboardStatsResponse["recentActivity"][number]
): string {
  switch (event.type) {
    case "job_completed":
      return `${event.agentType ?? "Agent"} job completed`;
    case "job_failed":
      return `${event.agentType ?? "Agent"} job failed`;
    case "article_created":
      return `"${event.articleTitle}" created`;
    case "article_transition":
      return `"${event.articleTitle}" moved to ${event.toStatus}`;
    default:
      return "Activity";
  }
}

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
