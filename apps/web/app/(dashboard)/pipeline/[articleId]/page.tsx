"use client";

import { useState, useEffect, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getArticle,
  updateArticle,
  transitionArticle,
  listArticleVersions,
  createArticleSection,
  updateArticleSection,
  deleteArticleSection,
  getActiveClientId,
  type Article,
  type ArticleSection,
  type ArticleVersion,
  type ArticleStatus,
  type ContentFormat,
  type SectionType,
} from "../../../../lib/api";

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

export default function ArticleDetailPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const router = useRouter();
  const [clientId] = useState(() => getActiveClientId());
  const [article, setArticle] = useState<Article | null>(null);
  const [sections, setSections] = useState<ArticleSection[]>([]);
  const [versions, setVersions] = useState<ArticleVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "sections" | "versions">("edit");
  const [showAddSection, setShowAddSection] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);

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

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    Promise.all([
      getArticle(clientId, articleId),
      listArticleVersions(clientId, articleId),
    ])
      .then(([{ article, sections }, { versions }]) => {
        setArticle(article);
        setSections(sections);
        setVersions(versions);
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
        wordCountTarget: form.wordCountTarget
          ? parseInt(form.wordCountTarget, 10)
          : undefined,
        wordCountActual: form.wordCountActual
          ? parseInt(form.wordCountActual, 10)
          : undefined,
        metaDescription: form.metaDescription || undefined,
        strategicRationale: form.strategicRationale || undefined,
        body: form.body || undefined,
        scheduledDate: form.scheduledDate || undefined,
      });
      setArticle(updated);
      setSuccess(true);
      // Refresh versions after body update
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

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-4">
          Changes saved.
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(["edit", "sections", "versions"] as const).map((tab) => (
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, wordCountTarget: e.target.value }))
                  }
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, wordCountActual: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Keywords (comma-separated)
                </label>
                <input
                  value={form.targetKeywords}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, targetKeywords: e.target.value }))
                  }
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, metaDescription: e.target.value }))
                  }
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, strategicRationale: e.target.value }))
                  }
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Article Body
                </label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  rows={12}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                  placeholder="Full article body (saves a version on change)"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Sections tab */}
      {activeTab === "sections" && (
        <div className="space-y-3">
          {sections.map((section) => (
            <SectionEditor
              key={section.id}
              section={section}
              isEditing={editingSection === section.id}
              onEdit={() => setEditingSection(section.id)}
              onCancel={() => setEditingSection(null)}
              onSave={(data) => handleUpdateSection(section.id, data)}
              onDelete={() => handleDeleteSection(section.id)}
            />
          ))}

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
                  onChange={(e) =>
                    setSectionForm((f) => ({ ...f, heading: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Type
                </label>
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
                  onChange={(e) =>
                    setSectionForm((f) => ({ ...f, body: e.target.value }))
                  }
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

      {/* Versions tab */}
      {activeTab === "versions" && (
        <div className="space-y-3">
          {versions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No versions yet.</p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-900">
                    Version {v.version}
                  </span>
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
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SectionEditor({
  section,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  section: ArticleSection;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (data: Partial<{ heading: string; body: string; sectionType: SectionType }>) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState({
    heading: section.heading,
    body: section.body,
    sectionType: section.sectionType ?? ("" as SectionType | ""),
  });

  function formatLabel(s: string) {
    return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (!isEditing) {
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
          <div className="flex gap-1 shrink-0">
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
