"use client";

import { useState, useEffect, FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  listArticles,
  createArticle,
  bulkTransitionArticles,
  bulkDismissArticles,
  triggerSuggestions,
  getAgentJob,
  cancelAgentJob,
} from "../../../../../lib/api";
import type { Article, CreateArticleInput } from "../../../../../lib/api";

type SortOption = "updated" | "seo_score";

export default function SuggestionsPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const [suggestions, setSuggestions] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortOption>("updated");

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const [genPreferences, setGenPreferences] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<number | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Manual create form
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createKeywords, setCreateKeywords] = useState("");
  const [createWordCount, setCreateWordCount] = useState("");
  const [createSeoScore, setCreateSeoScore] = useState("");
  const [saving, setSaving] = useState(false);

  // Bulk action state
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    loadSuggestions();
  }, [clientId, sort]);

  async function loadSuggestions() {
    setLoading(true);
    setError(null);
    try {
      const { articles } = await listArticles(clientId, {
        status: "suggested",
        sort: sort === "seo_score" ? "seo_score" : undefined,
      });
      setSuggestions(articles);
      setSelected(new Set());
    } catch {
      setError("Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === suggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map((s) => s.id)));
    }
  }

  async function handleBulkApprove() {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      await bulkTransitionArticles(clientId, [...selected], "approved");
      await loadSuggestions();
    } catch {
      setError("Failed to approve articles");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkDismiss() {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      await bulkDismissArticles(clientId, [...selected]);
      await loadSuggestions();
    } catch {
      setError("Failed to dismiss articles");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setGenProgress(0);
    setError(null);
    setCancelling(false);
    try {
      const { agentJobId } = await triggerSuggestions(
        clientId,
        genCount,
        genPreferences || undefined
      );
      setActiveJobId(agentJobId);

      // Poll for completion
      const poll = async () => {
        const { job } = await getAgentJob(clientId, agentJobId);
        setGenProgress(job.progress ?? 0);

        if (job.status === "completed") {
          setGenerating(false);
          setGenProgress(null);
          setActiveJobId(null);
          setShowGenerate(false);
          setGenPreferences("");
          await loadSuggestions();
          return;
        }

        if (job.status === "failed" || job.status === "cancelled") {
          setGenerating(false);
          setGenProgress(null);
          setActiveJobId(null);
          if (job.status === "cancelled") {
            setShowGenerate(false);
          } else {
            setError(job.errorMessage ?? "Suggestion generation failed");
          }
          return;
        }

        setTimeout(poll, 1000);
      };

      await poll();
    } catch {
      setGenerating(false);
      setGenProgress(null);
      setActiveJobId(null);
      setError("Failed to start suggestion generation");
    }
  }

  async function handleCancelJob() {
    if (!activeJobId || cancelling) return;
    setCancelling(true);
    try {
      await cancelAgentJob(clientId, activeJobId);
    } catch {
      setError("Failed to cancel job");
      setCancelling(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!createTitle.trim()) return;
    setSaving(true);
    try {
      const data: CreateArticleInput = {
        title: createTitle.trim(),
      };
      if (createKeywords.trim()) {
        data.targetKeywords = createKeywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      }
      if (createWordCount.trim()) {
        const wc = parseInt(createWordCount, 10);
        if (!isNaN(wc) && wc > 0) data.wordCountTarget = wc;
      }
      if (createSeoScore.trim()) {
        const score = parseInt(createSeoScore, 10);
        if (!isNaN(score) && score >= 0 && score <= 100) data.seoScore = score;
      }
      await createArticle(clientId, data);
      setShowCreate(false);
      setCreateTitle("");
      setCreateKeywords("");
      setCreateWordCount("");
      setCreateSeoScore("");
      await loadSuggestions();
    } catch {
      setError("Failed to create suggestion");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <a
            href={`/clients/${clientId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Client
          </a>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl font-bold text-gray-900">Suggestions</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            + Manual
          </button>
          <button
            onClick={() => setShowGenerate(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Generate Suggestions
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={
                suggestions.length > 0 && selected.size === suggestions.length
              }
              onChange={toggleSelectAll}
              className="rounded border-gray-300"
            />
            Select all ({suggestions.length})
          </label>
          {selected.size > 0 && (
            <span className="text-sm text-gray-500">
              {selected.size} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <button
                onClick={handleBulkApprove}
                disabled={bulkLoading}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Approve ({selected.size})
              </button>
              <button
                onClick={handleBulkDismiss}
                disabled={bulkLoading}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Dismiss ({selected.size})
              </button>
            </>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700"
          >
            <option value="updated">Sort: Recent</option>
            <option value="seo_score">Sort: SEO Score</option>
          </select>
        </div>
      </div>

      {/* Suggestions List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">
          Loading suggestions...
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-3">No suggestions yet.</p>
          <button
            onClick={() => setShowGenerate(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Generate Suggestions
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {suggestions.map((article) => (
            <div
              key={article.id}
              className={`rounded-lg border bg-white p-4 transition-colors ${
                selected.has(article.id)
                  ? "border-blue-300 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(article.id)}
                  onChange={() => toggleSelect(article.id)}
                  className="mt-1 rounded border-gray-300"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900 truncate">
                      {article.title}
                    </h3>
                    {article.contentFormat && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {article.contentFormat.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    {article.targetKeywords &&
                      article.targetKeywords.length > 0 && (
                        <span>
                          Keywords:{" "}
                          {article.targetKeywords.slice(0, 3).join(", ")}
                          {article.targetKeywords.length > 3 && "..."}
                        </span>
                      )}
                    {article.wordCountTarget && (
                      <span>{article.wordCountTarget} words</span>
                    )}
                  </div>
                  {article.strategicRationale && (
                    <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                      {article.strategicRationale}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {article.seoScore != null ? (
                    <div
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ${
                        article.seoScore >= 70
                          ? "bg-green-100 text-green-800"
                          : article.seoScore >= 40
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {article.seoScore}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">&mdash;</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Generate Suggestions
            </h2>
            <form onSubmit={handleGenerate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of suggestions
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={genCount}
                    onChange={(e) => setGenCount(parseInt(e.target.value, 10) || 5)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preferences (optional)
                  </label>
                  <textarea
                    value={genPreferences}
                    onChange={(e) => setGenPreferences(e.target.value)}
                    placeholder="e.g. Focus on beginner-friendly topics..."
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                {generating && genProgress != null && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{cancelling ? "Cancelling..." : "Generating..."}</span>
                      <span>{genProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${cancelling ? "bg-red-400" : "bg-blue-600"}`}
                        style={{ width: `${genProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                {generating ? (
                  <button
                    type="button"
                    onClick={handleCancelJob}
                    disabled={cancelling}
                    className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling..." : "Cancel Job"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowGenerate(false)}
                    className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={generating}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Create Suggestion
            </h2>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Article title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target keywords (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={createKeywords}
                    onChange={(e) => setCreateKeywords(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="seo, content marketing"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Word count target
                    </label>
                    <input
                      type="number"
                      value={createWordCount}
                      onChange={(e) => setCreateWordCount(e.target.value)}
                      min={0}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      placeholder="1500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SEO Score (0-100)
                    </label>
                    <input
                      type="number"
                      value={createSeoScore}
                      onChange={(e) => setCreateSeoScore(e.target.value)}
                      min={0}
                      max={100}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      placeholder="75"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !createTitle.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
