"use client";

import { useState, useEffect, FormEvent } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  listArticles,
  createArticle,
  transitionArticle,
  deleteArticle,
  triggerWriteArticle,
  getActiveClientId,
  type Article,
  type ArticleStatus,
  type ContentFormat,
} from "../../../lib/api";

const COLUMNS: { status: ArticleStatus; label: string; color: string }[] = [
  { status: "suggested", label: "Suggested", color: "bg-gray-100" },
  { status: "approved", label: "Approved", color: "bg-blue-50" },
  { status: "writing", label: "Writing", color: "bg-yellow-50" },
  { status: "written", label: "Written", color: "bg-purple-50" },
  { status: "proofreading", label: "Proofreading", color: "bg-orange-50" },
  { status: "ready", label: "Ready", color: "bg-green-50" },
];

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

const CONTENT_FORMATS: ContentFormat[] = [
  "how_to",
  "listicle",
  "deep_dive",
  "comparison",
  "general",
];

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ArticleCard({
  article,
  onDelete,
  onWrite,
  isWriting,
}: {
  article: Article;
  onDelete: (id: string) => void;
  onWrite?: (id: string) => void;
  isWriting?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: article.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm cursor-grab active:cursor-grabbing select-none"
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <a
          href={`/pipeline/${article.id}`}
          className="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-2 leading-snug"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {article.title}
        </a>
        <button
          className="shrink-0 text-gray-300 hover:text-red-500 transition-colors text-xs leading-none"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Delete this article?")) onDelete(article.id);
          }}
        >
          ✕
        </button>
      </div>
      {article.contentFormat && (
        <p className="mt-1.5 text-xs text-gray-400">{formatLabel(article.contentFormat)}</p>
      )}
      {article.targetKeywords && article.targetKeywords.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {article.targetKeywords.slice(0, 3).map((kw: string) => (
            <span
              key={kw}
              className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"
            >
              {kw}
            </span>
          ))}
          {article.targetKeywords.length > 3 && (
            <span className="text-xs text-gray-400">
              +{article.targetKeywords.length - 3}
            </span>
          )}
        </div>
      )}
      {article.wordCountTarget && (
        <p className="mt-1.5 text-xs text-gray-400">
          {article.wordCountActual
            ? `${article.wordCountActual} / ${article.wordCountTarget} words`
            : `${article.wordCountTarget} words target`}
        </p>
      )}
      {article.status === "approved" && onWrite && (
        <div className="mt-2">
          <button
            disabled={isWriting}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onWrite(article.id);
            }}
            className="w-full rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {isWriting ? "Starting…" : "Write with AI"}
          </button>
        </div>
      )}
    </div>
  );
}

function ArticleCardOverlay({ article }: { article: Article }) {
  return (
    <div className="bg-white rounded-lg border border-blue-400 p-3 shadow-lg w-56 rotate-2">
      <p className="text-sm font-medium text-gray-900 line-clamp-2">{article.title}</p>
      {article.contentFormat && (
        <p className="mt-1 text-xs text-gray-400">{formatLabel(article.contentFormat)}</p>
      )}
    </div>
  );
}

function Column({
  status,
  label,
  color,
  articles,
  onDelete,
  onWrite,
  writingArticles,
}: {
  status: ArticleStatus;
  label: string;
  color: string;
  articles: Article[];
  onDelete: (id: string) => void;
  onWrite: (id: string) => void;
  writingArticles: Set<string>;
}) {
  return (
    <div className={`flex flex-col rounded-xl border border-gray-200 ${color} min-h-[200px] w-52 shrink-0`}>
      <div className="px-3 py-2.5 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">{label}</span>
          <span className="text-xs bg-white rounded-full px-1.5 py-0.5 font-medium text-gray-500 border border-gray-200">
            {articles.length}
          </span>
        </div>
      </div>
      <SortableContext
        items={articles.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2 p-2 flex-1">
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onDelete={onDelete}
              onWrite={status === "approved" ? onWrite : undefined}
              isWriting={writingArticles.has(article.id)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export default function PipelinePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [writingArticles, setWritingArticles] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    title: "",
    contentFormat: "" as ContentFormat | "",
    targetKeywords: "",
    wordCountTarget: "",
    strategicRationale: "",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    const id = getActiveClientId();
    setClientId(id);
    if (!id) {
      setLoading(false);
      return;
    }
    listArticles(id)
      .then((r: { articles: Article[] }) => setArticles(r.articles))
      .catch(() => setError("Failed to load articles"))
      .finally(() => setLoading(false));
  }, []);

  function getArticlesByStatus(status: ArticleStatus) {
    return articles.filter((a) => a.status === status);
  }

  function findArticle(id: string) {
    return articles.find((a) => a.id === id) ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveArticle(findArticle(event.active.id as string));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveArticle(null);
    const { active, over } = event;
    if (!over || !clientId) return;

    const draggedId = active.id as string;
    const overId = over.id as string;

    const draggedArticle = findArticle(draggedId);
    if (!draggedArticle) return;

    // Determine target column: over.id could be a column status or another article id
    let targetStatus: ArticleStatus | null = null;
    const isColumn = COLUMNS.some((c) => c.status === overId);
    if (isColumn) {
      targetStatus = overId as ArticleStatus;
    } else {
      const overArticle = findArticle(overId);
      if (overArticle) targetStatus = overArticle.status;
    }

    if (!targetStatus || targetStatus === draggedArticle.status) return;
    if (!VALID_TRANSITIONS[draggedArticle.status].includes(targetStatus)) return;

    // Optimistic update
    setArticles((prev) =>
      prev.map((a) =>
        a.id === draggedId ? { ...a, status: targetStatus! } : a
      )
    );

    try {
      const { article } = await transitionArticle(clientId, draggedId, targetStatus);
      setArticles((prev) =>
        prev.map((a) => (a.id === article.id ? article : a))
      );
    } catch {
      // Revert on error
      setArticles((prev) =>
        prev.map((a) =>
          a.id === draggedId ? { ...a, status: draggedArticle.status } : a
        )
      );
      setError("Failed to move article — invalid transition");
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setError(null);
    try {
      const { article } = await createArticle(clientId, {
        title: form.title,
        contentFormat: form.contentFormat || undefined,
        targetKeywords: form.targetKeywords
          ? form.targetKeywords.split(",").map((k) => k.trim()).filter(Boolean)
          : undefined,
        wordCountTarget: form.wordCountTarget
          ? parseInt(form.wordCountTarget, 10)
          : undefined,
        strategicRationale: form.strategicRationale || undefined,
      });
      setArticles((prev) => [article, ...prev]);
      setShowCreate(false);
      setForm({ title: "", contentFormat: "", targetKeywords: "", wordCountTarget: "", strategicRationale: "" });
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e?.body?.error ?? "Failed to create article");
    }
  }

  async function handleWrite(articleId: string) {
    if (!clientId) return;
    setWritingArticles((prev) => new Set(prev).add(articleId));
    try {
      await triggerWriteArticle(clientId, articleId);
      // Optimistically move article to "writing" status
      setArticles((prev) =>
        prev.map((a) => (a.id === articleId ? { ...a, status: "writing" as ArticleStatus } : a))
      );
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e?.body?.error ?? "Failed to start writing — ensure the article has outline sections");
    } finally {
      setWritingArticles((prev) => {
        const next = new Set(prev);
        next.delete(articleId);
        return next;
      });
    }
  }

  async function handleDelete(articleId: string) {
    if (!clientId) return;
    setArticles((prev) => prev.filter((a) => a.id !== articleId));
    try {
      await deleteArticle(clientId, articleId);
    } catch {
      setError("Failed to delete article");
    }
  }

  if (!clientId) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">
          Select a client from the sidebar to view their pipeline.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">Article Pipeline</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          {showCreate ? "Cancel" : "+ New Article"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4 shrink-0">
          {error}
        </p>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-4 shrink-0"
        >
          <h2 className="font-semibold text-gray-900 mb-3">New Article</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Article title"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Content Format
              </label>
              <select
                value={form.contentFormat}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contentFormat: e.target.value as ContentFormat | "" }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">— Select —</option>
                {CONTENT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {formatLabel(f)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
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
                placeholder="e.g. 1500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Target Keywords (comma-separated)
              </label>
              <input
                value={form.targetKeywords}
                onChange={(e) =>
                  setForm((f) => ({ ...f, targetKeywords: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="seo, content marketing, keyword research"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Strategic Rationale
              </label>
              <textarea
                value={form.strategicRationale}
                onChange={(e) =>
                  setForm((f) => ({ ...f, strategicRationale: e.target.value }))
                }
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Why we're creating this article"
              />
            </div>
          </div>
          <div className="mt-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Create Article
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading pipeline…</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 flex-1">
            {COLUMNS.map(({ status, label, color }) => (
              <Column
                key={status}
                status={status}
                label={label}
                color={color}
                articles={getArticlesByStatus(status)}
                onDelete={handleDelete}
                onWrite={handleWrite}
                writingArticles={writingArticles}
              />
            ))}
          </div>
          <DragOverlay>
            {activeArticle ? (
              <ArticleCardOverlay article={activeArticle} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
