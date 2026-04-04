"use client";

import { useState, useEffect, FormEvent, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  getArticle,
  updateArticle,
  transitionArticle,
  listArticleVersions,
  createArticleSection,
  updateArticleSection,
  deleteArticleSection,
  listArticleComments,
  createArticleComment,
  resolveArticleComment,
  deleteArticleComment,
  getActiveClientId,
  type Article,
  type ArticleSection,
  type ArticleVersion,
  type ArticleComment,
  type ArticleStatus,
  type ContentFormat,
  type SectionType,
} from "../../../../lib/api";

const TiptapEditor = dynamic(() => import("../../../../components/TiptapEditor"), {
  ssr: false,
  loading: () => <div className="border border-gray-300 rounded-lg p-3 min-h-[200px] text-sm text-gray-400">Loading editor…</div>,
});

const STATUS_BADGE: Record<ArticleStatus, string> = {
  suggested: "bg-gray-100 text-gray-700",
  approved: "bg-blue-100 text-blue-700",
  writing: "bg-yellow-100 text-yellow-700",
  written: "bg-purple-100 text-purple-700",
  proofreading: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
};

const VALID_TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  suggested: ["approved"],
  approved: ["writing", "suggested"],
  writing: ["written"],
  written: ["proofreading", "approved"],
  proofreading: ["ready", "written"],
  ready: [],
};

const STATUS_LABELS: Record<ArticleStatus, string> = {
  suggested: "Suggested",
  approved: "Approved",
  writing: "Writing",
  written: "Written",
  proofreading: "Proofreading",
  ready: "Ready",
};

const CONTENT_FORMATS: ContentFormat[] = [
  "how_to",
  "listicle",
  "deep_dive",
  "comparison",
  "general",
];

const SECTION_TYPES: SectionType[] = ["intro", "heading", "subheading", "conclusion"];

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Simple line-level diff ──────────────────────────────────────────────────

type DiffOp = { type: "same" | "added" | "removed"; text: string };

function computeDiff(a: string, b: string): DiffOp[] {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const m = linesA.length;
  const n = linesB.length;

  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      ops.push({ type: "same", text: linesA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "added", text: linesB[j - 1] });
      j--;
    } else {
      ops.push({ type: "removed", text: linesA[i - 1] });
      i--;
    }
  }
  return ops.reverse();
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function ArticleDetailPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const router = useRouter();
  const [clientId] = useState(() => getActiveClientId());
  const [article, setArticle] = useState<Article | null>(null);
  const [sections, setSections] = useState<ArticleSection[]>([]);
  const [versions, setVersions] = useState<ArticleVersion[]>([]);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "sections" | "comments" | "versions">("edit");
  const [showAddSection, setShowAddSection] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [commentingSectionId, setCommentingSectionId] = useState<string | null>(null);
  const [diffVersions, setDiffVersions] = useState<[number, number] | null>(null);

  const [form, setForm] = useState({
    title: "",
    contentFormat: "" as ContentFormat | "",
    targetKeywords: "",
    wordCountTarget: "",
    wordCountActual: "",
    metaDescription: "",
    strategicRationale: "",
    body: "",
    scheduledDate: "",
  });

  const [sectionForm, setSectionForm] = useState({
    heading: "",
    body: "",
    sectionType: "" as SectionType | "",
  });

  const [newComment, setNewComment] = useState("");
  const [commentSectionId, setCommentSectionId] = useState<string | undefined>(undefined);

  const loadComments = useCallback(async () => {
    if (!clientId) return;
    try {
      const { comments: c } = await listArticleComments(clientId, articleId);
      setComments(c);
    } catch {
      // non-fatal
    }
  }, [clientId, articleId]);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    Promise.all([
      getArticle(clientId, articleId),
      listArticleVersions(clientId, articleId),
      listArticleComments(clientId, articleId),
    ])
      .then(([{ article, sections }, { versions }, { comments }]) => {
        setArticle(article);
        setSections(sections);
        setVersions(versions);
        setComments(comments);
        setForm({
          title: article.title,
          contentFormat: article.contentFormat ?? "",
          targetKeywords: (article.targetKeywords ?? []).join(", "),
          wordCountTarget: article.wordCountTarget?.toString() ?? "",
          wordCountActual: article.wordCountActual?.toString() ?? "",
          metaDescription: article.metaDescription ?? "",
          strategicRationale: article.strategicRationale ?? "",
          body: article.body ?? "",
          scheduledDate: article.scheduledDate ?? "",
        });
      })
      .catch(() => setError("Article not found"))
      .finally(() => setLoading(false));
  }, [clientId, articleId]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !article) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const { article: updated } = await updateArticle(clientId, articleId, {
        title: form.title,
        contentFormat: (form.contentFormat as ContentFormat) || undefined,
        targetKeywords: form.targetKeywords
          ? form.targetKeywords.split(",").map((k) => k.trim()).filter(Boolean)
          : undefined,
        wordCountTarget: form.wordCountTarget ? parseInt(form.wordCountTarget, 10) : undefined,
        wordCountActual: form.wordCountActual ? parseInt(form.wordCountActual, 10) : undefined,
        metaDescription: form.metaDescription || undefined,
        strategicRationale: form.strategicRationale || undefined,
        body: form.body || undefined,
        scheduledDate: form.scheduledDate || undefined,
      });
      setArticle(updated);
      setSuccess(true);
      const { versions: newVersions } = await listArticleVersions(clientId, articleId);
      setVersions(newVersions);
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e?.body?.error ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(toStatus: ArticleStatus) {
    if (!clientId || !article) return;
    setError(null);
    try {
      const { article: updated } = await transitionArticle(clientId, articleId, toStatus);
      setArticle(updated);
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e?.body?.error ?? "Transition failed");
    }
  }

  async function handleAddSection(e: FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    try {
      const { section } = await createArticleSection(clientId, articleId, {
        heading: sectionForm.heading,
        body: sectionForm.body,
        sortOrder: sections.length,
        sectionType: (sectionForm.sectionType as SectionType) || undefined,
      });
      setSections((prev) => [...prev, section]);
      setShowAddSection(false);
      setSectionForm({ heading: "", body: "", sectionType: "" });
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e?.body?.error ?? "Failed to add section");
    }
  }

  async function handleUpdateSection(
    sectionId: string,
    data: Partial<{ heading: string; body: string; sortOrder: number; sectionType: SectionType }>
  ) {
    if (!clientId) return;
    try {
      const { section } = await updateArticleSection(clientId, articleId, sectionId, data);
      setSections((prev) => prev.map((s) => (s.id === sectionId ? section : s)));
      setEditingSection(null);
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e?.body?.error ?? "Failed to update section");
    }
  }

  async function handleDeleteSection(sectionId: string) {
    if (!clientId || !confirm("Delete this section?")) return;
    try {
      await deleteArticleSection(clientId, articleId, sectionId);
      setSections((prev) => prev.filter((s) => s.id !== sectionId));
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e?.body?.error ?? "Failed to delete section");
    }
  }

  async function handleAddComment(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !newComment.trim()) return;
    try {
      await createArticleComment(clientId, articleId, {
        comment: newComment.trim(),
        sectionId: commentSectionId,
      });
      setNewComment("");
      setCommentSectionId(undefined);
      setCommentingSectionId(null);
      await loadComments();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e?.body?.error ?? "Failed to add comment");
    }
  }

  async function handleAddSectionComment(e: FormEvent, sectionId: string, text: string) {
    e.preventDefault();
    if (!clientId || !text.trim()) return;
    try {
      await createArticleComment(clientId, articleId, { comment: text.trim(), sectionId });
      setCommentingSectionId(null);
      await loadComments();
      setActiveTab("comments");
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e?.body?.error ?? "Failed to add comment");
    }
  }

  async function handleResolveComment(commentId: string, resolved: boolean) {
    if (!clientId) return;
    try {
      const { comment: updated } = await resolveArticleComment(clientId, articleId, commentId, resolved);
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
    } catch {
      // non-fatal
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!clientId || !confirm("Delete this comment?")) return;
    try {
      await deleteArticleComment(clientId, articleId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      // non-fatal
    }
  }

  if (!clientId) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Select a client to view articles.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600">{error ?? "Article not found"}</p>
      </div>
    );
  }

  const nextStatuses = VALID_TRANSITIONS[article.status];
  const openComments = comments.filter((c) => !c.resolved);
  const resolvedComments = comments.filter((c) => c.resolved);

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <button
          onClick={() => router.push("/pipeline")}
          className="text-sm text-gray-500 hover:text-gray-700 shrink-0 mt-0.5"
        >
          ← Pipeline
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{article.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[article.status]}`}
            >
              {STATUS_LABELS[article.status]}
            </span>
            {article.contentFormat && (
              <span className="text-xs text-gray-500">{formatLabel(article.contentFormat)}</span>
            )}
            {openComments.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {openComments.length} open comment{openComments.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status transitions */}
      {nextStatuses.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-500">Move to:</span>
          {nextStatuses.map((s) => (
            <button
              key={s}
              onClick={() => handleTransition(s)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {/* Ready banner */}
      {article.status === "ready" && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-2">
          <span className="text-green-700 text-sm font-medium">Article approved for delivery</span>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-4">
          Changes saved.
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(["edit", "sections", "comments", "versions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "versions" && versions.length > 0 && (
              <span className="ml-1.5 text-xs text-gray-400">({versions.length})</span>
            )}
            {tab === "sections" && sections.length > 0 && (
              <span className="ml-1.5 text-xs text-gray-400">({sections.length})</span>
            )}
            {tab === "comments" && openComments.length > 0 && (
              <span className="ml-1.5 text-xs text-amber-600 font-semibold">({openComments.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Edit tab */}
      {activeTab === "edit" && (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content Format
                </label>
                <select
                  value={form.contentFormat}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contentFormat: e.target.value as ContentFormat | "" }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">— None —</option>
                  {CONTENT_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {formatLabel(f)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Word Count Target
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.wordCountTarget}
                  onChange={(e) => setForm((f) => ({ ...f, wordCountTarget: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Word Count Actual
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.wordCountActual}
                  onChange={(e) => setForm((f) => ({ ...f, wordCountActual: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Keywords (comma-separated)
                </label>
                <input
                  value={form.targetKeywords}
                  onChange={(e) => setForm((f) => ({ ...f, targetKeywords: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="seo, content marketing, ..."
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Meta Description
                </label>
                <textarea
                  value={form.metaDescription}
                  onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Strategic Rationale
                </label>
                <textarea
                  value={form.strategicRationale}
                  onChange={(e) => setForm((f) => ({ ...f, strategicRationale: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Article Body
                </label>
                <TiptapEditor
                  content={form.body}
                  onChange={(html) => setForm((f) => ({ ...f, body: html }))}
                  placeholder="Start writing the article body…"
                  editable={article.status !== "ready"}
                />
                <p className="mt-1 text-xs text-gray-400">Each save creates a new version.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving || article.status === "ready"}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
              {article.status === "ready" && (
                <span className="text-xs text-gray-400">Article is ready — editing locked.</span>
              )}
            </div>
          </div>
        </form>
      )}

      {/* Sections tab */}
      {activeTab === "sections" && (
        <div className="space-y-3">
          {sections.map((section) => {
            const sectionCommentCount = comments.filter(
              (c) => c.sectionId === section.id && !c.resolved
            ).length;
            return (
              <SectionEditor
                key={section.id}
                section={section}
                isEditing={editingSection === section.id}
                isCommenting={commentingSectionId === section.id}
                openCommentCount={sectionCommentCount}
                onEdit={() => setEditingSection(section.id)}
                onCancel={() => setEditingSection(null)}
                onSave={(data) => handleUpdateSection(section.id, data)}
                onDelete={() => handleDeleteSection(section.id)}
                onCommentOpen={() => {
                  setCommentingSectionId(section.id);
                  setEditingSection(null);
                }}
                onCommentClose={() => setCommentingSectionId(null)}
                onCommentSubmit={(e, text) => handleAddSectionComment(e, section.id, text)}
              />
            );
          })}

          {sections.length === 0 && !showAddSection && (
            <p className="text-sm text-gray-400 text-center py-8">No sections yet.</p>
          )}

          {showAddSection ? (
            <form
              onSubmit={handleAddSection}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3"
            >
              <h3 className="font-semibold text-gray-900">Add Section</h3>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Heading <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={sectionForm.heading}
                  onChange={(e) => setSectionForm((f) => ({ ...f, heading: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={sectionForm.sectionType}
                  onChange={(e) =>
                    setSectionForm((f) => ({
                      ...f,
                      sectionType: e.target.value as SectionType | "",
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">— None —</option>
                  {SECTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {formatLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Body</label>
                <textarea
                  value={sectionForm.body}
                  onChange={(e) => setSectionForm((f) => ({ ...f, body: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddSection(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddSection(true)}
              className="w-full rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Add Section
            </button>
          )}
        </div>
      )}

      {/* Comments tab */}
      {activeTab === "comments" && (
        <div className="space-y-4">
          {/* Add comment form */}
          <form
            onSubmit={handleAddComment}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3"
          >
            <h3 className="text-sm font-semibold text-gray-900">Add Comment</h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Section (optional)
              </label>
              <select
                value={commentSectionId ?? ""}
                onChange={(e) =>
                  setCommentSectionId(e.target.value || undefined)
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">— General (whole article) —</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.heading}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Comment / Instruction for AI
              </label>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                placeholder="Leave feedback or instructions for the AI writer…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!newComment.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              Post Comment
            </button>
          </form>

          {/* Open comments */}
          {openComments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Open ({openComments.length})
              </h3>
              {openComments.map((c) => (
                <CommentCard
                  key={c.id}
                  comment={c}
                  sections={sections}
                  onResolve={() => handleResolveComment(c.id, true)}
                  onDelete={() => handleDeleteComment(c.id)}
                />
              ))}
            </div>
          )}

          {/* Resolved comments */}
          {resolvedComments.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 select-none">
                Resolved ({resolvedComments.length})
              </summary>
              <div className="mt-2 space-y-2">
                {resolvedComments.map((c) => (
                  <CommentCard
                    key={c.id}
                    comment={c}
                    sections={sections}
                    onResolve={() => handleResolveComment(c.id, false)}
                    onDelete={() => handleDeleteComment(c.id)}
                  />
                ))}
              </div>
            </details>
          )}

          {comments.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No comments yet.</p>
          )}
        </div>
      )}

      {/* Versions tab */}
      {activeTab === "versions" && (
        <div className="space-y-3">
          {versions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No versions yet.</p>
          ) : (
            <>
              {/* Diff controls */}
              {versions.length >= 2 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Compare Versions</h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    <select
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                      value={diffVersions?.[0] ?? ""}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setDiffVersions((prev) => [v, prev?.[1] ?? versions[0].version]);
                      }}
                    >
                      <option value="">From version…</option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.version}>
                          v{v.version} ({v.changeSource}, {new Date(v.createdAt).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-400 text-sm">→</span>
                    <select
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                      value={diffVersions?.[1] ?? ""}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setDiffVersions((prev) => [prev?.[0] ?? versions[versions.length - 1].version, v]);
                      }}
                    >
                      <option value="">To version…</option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.version}>
                          v{v.version} ({v.changeSource}, {new Date(v.createdAt).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                    {diffVersions && (
                      <button
                        onClick={() => setDiffVersions(null)}
                        className="text-xs text-gray-500 hover:text-red-600 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {diffVersions && diffVersions[0] && diffVersions[1] && (
                    <DiffView
                      versionA={versions.find((v) => v.version === diffVersions[0])}
                      versionB={versions.find((v) => v.version === diffVersions[1])}
                    />
                  )}
                </div>
              )}

              {/* Version list */}
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-900">Version {v.version}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                          v.changeSource === "human"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {v.changeSource}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {v.changeNote && (
                    <p className="text-xs text-gray-500 mb-2">{v.changeNote}</p>
                  )}
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                    {v.body.slice(0, 500)}
                    {v.body.length > 500 ? "…" : ""}
                  </pre>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── DiffView component ───────────────────────────────────────────────────────

function DiffView({
  versionA,
  versionB,
}: {
  versionA: ArticleVersion | undefined;
  versionB: ArticleVersion | undefined;
}) {
  if (!versionA || !versionB) return null;

  const ops = computeDiff(versionA.body, versionB.body);
  const hasChanges = ops.some((o) => o.type !== "same");

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">
          v{versionA.version} → v{versionB.version}
        </span>
        {!hasChanges && (
          <span className="text-xs text-gray-400">No differences</span>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 overflow-auto max-h-96 font-mono text-xs">
        {ops.map((op, i) => (
          <div
            key={i}
            className={`px-3 py-0.5 whitespace-pre-wrap ${
              op.type === "added"
                ? "bg-green-50 text-green-800 border-l-2 border-green-400"
                : op.type === "removed"
                ? "bg-red-50 text-red-800 border-l-2 border-red-400"
                : "text-gray-600"
            }`}
          >
            <span className="select-none mr-2 text-gray-300">
              {op.type === "added" ? "+" : op.type === "removed" ? "-" : " "}
            </span>
            {op.text || "\u00a0"}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CommentCard component ────────────────────────────────────────────────────

function CommentCard({
  comment,
  sections,
  onResolve,
  onDelete,
}: {
  comment: ArticleComment;
  sections: ArticleSection[];
  onResolve: () => void;
  onDelete: () => void;
}) {
  const section = sections.find((s) => s.id === comment.sectionId);

  return (
    <div
      className={`rounded-xl border p-3 shadow-sm ${
        comment.resolved
          ? "bg-gray-50 border-gray-200 opacity-70"
          : "bg-white border-amber-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {section && (
            <span className="inline-block text-xs text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 mb-1 font-medium">
              {section.heading}
            </span>
          )}
          {!section && !comment.sectionId && (
            <span className="inline-block text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 mb-1">
              General
            </span>
          )}
          <p className="text-sm text-gray-800 mt-0.5">{comment.comment}</p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(comment.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onResolve}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              comment.resolved
                ? "text-gray-500 hover:text-blue-600"
                : "text-green-600 hover:bg-green-50"
            }`}
          >
            {comment.resolved ? "Reopen" : "Resolve"}
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SectionEditor component ──────────────────────────────────────────────────

function SectionEditor({
  section,
  isEditing,
  isCommenting,
  openCommentCount,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onCommentOpen,
  onCommentClose,
  onCommentSubmit,
}: {
  section: ArticleSection;
  isEditing: boolean;
  isCommenting: boolean;
  openCommentCount: number;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (data: Partial<{ heading: string; body: string; sectionType: SectionType }>) => void;
  onDelete: () => void;
  onCommentOpen: () => void;
  onCommentClose: () => void;
  onCommentSubmit: (e: FormEvent, text: string) => void;
}) {
  const [form, setForm] = useState({
    heading: section.heading,
    body: section.body,
    sectionType: section.sectionType ?? ("" as SectionType | ""),
  });
  const [commentText, setCommentText] = useState("");

  function formatLabel(s: string) {
    return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (!isEditing && !isCommenting) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-start justify-between mb-1">
          <div>
            <span className="font-semibold text-gray-900">{section.heading}</span>
            {section.sectionType && (
              <span className="ml-2 text-xs text-gray-400">
                {formatLabel(section.sectionType)}
              </span>
            )}
          </div>
          <div className="flex gap-1 shrink-0 items-center">
            {openCommentCount > 0 && (
              <span className="text-xs text-amber-600 font-medium mr-1">
                {openCommentCount} comment{openCommentCount !== 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={onCommentOpen}
              className="text-xs text-gray-500 hover:text-amber-600 px-2 py-1 rounded transition-colors"
            >
              Comment
            </button>
            <button
              onClick={onEdit}
              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600 line-clamp-3 mt-1">
          {section.body || <span className="text-gray-400">No content</span>}
        </p>
      </div>
    );
  }

  if (isCommenting) {
    return (
      <div className="bg-white rounded-xl border border-amber-300 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-gray-900 text-sm">{section.heading}</span>
          <button
            onClick={onCommentClose}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
        <form
          onSubmit={(e) => {
            onCommentSubmit(e, commentText);
            setCommentText("");
          }}
          className="space-y-2"
        >
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Leave feedback or instructions for this section…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!commentText.trim()}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60 transition-colors"
          >
            Post Comment
          </button>
        </form>
      </div>
    );
  }

  // Editing
  return (
    <div className="bg-white rounded-xl border border-blue-300 p-4 shadow-sm space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Heading</label>
        <input
          value={form.heading}
          onChange={(e) => setForm((f) => ({ ...f, heading: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
        <select
          value={form.sectionType}
          onChange={(e) =>
            setForm((f) => ({ ...f, sectionType: e.target.value as SectionType | "" }))
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">— None —</option>
          {(["intro", "heading", "subheading", "conclusion"] as SectionType[]).map((t) => (
            <option key={t} value={t}>
              {formatLabel(t)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Body</label>
        <textarea
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          rows={5}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSave({
              heading: form.heading,
              body: form.body,
              sectionType: (form.sectionType as SectionType) || undefined,
            })
          }
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
