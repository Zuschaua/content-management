"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isSameDay,
  isSameMonth,
  parseISO,
  isToday,
} from "date-fns";
import {
  getCalendar,
  scheduleArticle,
  getActiveClientId,
  type Article,
  type ArticleStatus,
} from "../../../lib/api";

type ViewMode = "month" | "week";

const STATUS_COLORS: Record<ArticleStatus, { bg: string; text: string; dot: string }> = {
  suggested: { bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400" },
  approved: { bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
  writing: { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500" },
  written: { bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-500" },
  proofreading: { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  ready: { bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" },
};

const ALL_STATUSES: ArticleStatus[] = [
  "suggested",
  "approved",
  "writing",
  "written",
  "proofreading",
  "ready",
];

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Draggable article chip shown inside a calendar cell
function ArticleChip({
  article,
  compact = false,
}: {
  article: Article;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: article.id, data: { article } });

  const colors = STATUS_COLORS[article.status];

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded px-1.5 py-0.5 text-xs font-medium cursor-grab active:cursor-grabbing select-none flex items-center gap-1 ${colors.bg} ${colors.text} ${isDragging ? "opacity-30" : ""} ${compact ? "truncate" : ""}`}
      {...attributes}
      {...listeners}
      title={`${article.title} (${article.status})${article.targetKeywords?.length ? ` • ${article.targetKeywords.slice(0, 2).join(", ")}` : ""}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
      <span className="truncate">{article.title}</span>
    </div>
  );
}

// Overlay shown while dragging
function DragPreview({ article }: { article: Article }) {
  const colors = STATUS_COLORS[article.status];
  return (
    <div
      className={`rounded px-2 py-1 text-xs font-medium shadow-lg flex items-center gap-1.5 ${colors.bg} ${colors.text} border border-current/20 rotate-1`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
      <span className="max-w-[160px] truncate">{article.title}</span>
    </div>
  );
}

// Droppable date cell
function DateCell({
  date,
  articles,
  isCurrentMonth,
  viewMode,
}: {
  date: Date;
  articles: Article[];
  isCurrentMonth: boolean;
  viewMode: ViewMode;
}) {
  const dateKey = format(date, "yyyy-MM-dd");
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const today = isToday(date);

  return (
    <div
      ref={setNodeRef}
      className={`border border-gray-100 flex flex-col min-h-0 transition-colors ${
        isOver ? "bg-blue-50 border-blue-300" : isCurrentMonth ? "bg-white" : "bg-gray-50"
      } ${viewMode === "week" ? "min-h-40" : "min-h-24"}`}
    >
      {/* Day header */}
      <div className="px-1.5 pt-1 pb-0.5 flex items-center justify-between shrink-0">
        <span
          className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
            today
              ? "bg-blue-600 text-white"
              : isCurrentMonth
              ? "text-gray-700"
              : "text-gray-300"
          }`}
        >
          {format(date, "d")}
        </span>
        {articles.length === 0 && isCurrentMonth && !today && (
          <span className="w-1.5 h-1.5 rounded-full bg-gray-200" title="No articles scheduled" />
        )}
      </div>

      {/* Article chips */}
      <div className="px-1 pb-1 flex flex-col gap-0.5 flex-1 overflow-hidden">
        {articles.map((a) => (
          <ArticleChip key={a.id} article={a} compact />
        ))}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [statusFilter, setStatusFilter] = useState<Set<ArticleStatus>>(
    new Set(ALL_STATUSES)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Compute visible date range
  const visibleStart =
    viewMode === "month"
      ? startOfWeek(startOfMonth(currentDate))
      : startOfWeek(currentDate);
  const visibleEnd =
    viewMode === "month"
      ? endOfWeek(endOfMonth(currentDate))
      : endOfWeek(currentDate);
  const visibleDays = eachDayOfInterval({ start: visibleStart, end: visibleEnd });

  // Current month key for API (YYYY-MM)
  const monthKey = format(currentDate, "yyyy-MM");

  const loadArticles = useCallback(
    async (cid: string, month: string) => {
      setLoading(true);
      setError(null);
      try {
        const { articles: fetched } = await getCalendar(cid, month);
        setArticles(fetched);
      } catch {
        setError("Failed to load calendar");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const id = getActiveClientId();
    setClientId(id);
    if (!id) {
      setLoading(false);
      return;
    }
    loadArticles(id, monthKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  function getArticlesForDate(date: Date): Article[] {
    const key = format(date, "yyyy-MM-dd");
    return articles.filter(
      (a) =>
        a.scheduledDate === key && statusFilter.has(a.status)
    );
  }

  function navigate(direction: 1 | -1) {
    setCurrentDate((d) =>
      viewMode === "month"
        ? direction === 1
          ? addMonths(d, 1)
          : subMonths(d, 1)
        : direction === 1
        ? addWeeks(d, 1)
        : subWeeks(d, 1)
    );
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  function toggleStatus(status: ArticleStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const article = (event.active.data.current as { article: Article } | undefined)?.article;
    setActiveArticle(article ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveArticle(null);
    const { active, over } = event;
    if (!over || !clientId) return;

    const article = (active.data.current as { article: Article } | undefined)?.article;
    if (!article) return;

    const targetDate = over.id as string; // YYYY-MM-DD
    if (article.scheduledDate === targetDate) return;

    // Optimistic update
    setArticles((prev) =>
      prev.map((a) => (a.id === article.id ? { ...a, scheduledDate: targetDate } : a))
    );

    try {
      const { article: updated } = await scheduleArticle(clientId, article.id, targetDate);
      setArticles((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
    } catch {
      // Revert
      setArticles((prev) =>
        prev.map((a) =>
          a.id === article.id ? { ...a, scheduledDate: article.scheduledDate } : a
        )
      );
      setError("Failed to reschedule article");
    }
  }

  const headerTitle =
    viewMode === "month"
      ? format(currentDate, "MMMM yyyy")
      : `Week of ${format(visibleStart, "MMM d")} – ${format(visibleEnd, "MMM d, yyyy")}`;

  if (!clientId) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">
          Select a client from the sidebar to view their calendar.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Content Calendar</h1>
          <button
            onClick={goToday}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
              aria-label="Previous"
            >
              ‹
            </button>
            <button
              onClick={() => navigate(1)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
              aria-label="Next"
            >
              ›
            </button>
          </div>
          <span className="text-sm font-semibold text-gray-800">{headerTitle}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs">
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 font-medium transition-colors ${
                viewMode === "month"
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-300 ${
                viewMode === "week"
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex items-center gap-2 mb-3 shrink-0 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Filter:</span>
        {ALL_STATUSES.map((status) => {
          const colors = STATUS_COLORS[status];
          const active = statusFilter.has(status);
          return (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border ${
                active
                  ? `${colors.bg} ${colors.text} border-current/20`
                  : "bg-white text-gray-400 border-gray-200"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${active ? colors.dot : "bg-gray-300"}`} />
              {formatLabel(status)}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3 shrink-0">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">Loading calendar…</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 shrink-0 border-b border-gray-200 mb-0">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="px-2 py-1.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div
            className="grid grid-cols-7 flex-1 overflow-auto border-l border-t border-gray-200"
            style={{
              gridAutoRows: viewMode === "week" ? "1fr" : undefined,
            }}
          >
            {visibleDays.map((date) => (
              <DateCell
                key={format(date, "yyyy-MM-dd")}
                date={date}
                articles={getArticlesForDate(date)}
                isCurrentMonth={
                  viewMode === "week" ? true : isSameMonth(date, currentDate)
                }
                viewMode={viewMode}
              />
            ))}
          </div>

          <DragOverlay>
            {activeArticle ? <DragPreview article={activeArticle} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
