"use client";

import { useState, useEffect, FormEvent } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  listKbSections,
  createKbSection,
  updateKbSection,
  deleteKbSection,
  listKbVersions,
  revertKbSection,
  type KbSection,
  type KbSectionType,
  type KbVersion,
  type CreateKbSectionInput,
} from "../../../../../lib/api";

const TiptapEditor = dynamic(() => import("../../../../../components/TiptapEditor"), {
  ssr: false,
  loading: () => <div className="h-32 rounded-lg border border-gray-200 bg-gray-50 animate-pulse" />,
});

const SECTION_TYPE_LABELS: Record<KbSectionType, string> = {
  niche_overview: "Niche Overview",
  products_services: "Products & Services",
  target_audience: "Target Audience",
  competitors: "Competitors",
  content_gaps: "Content Gaps",
  what_works: "What Works",
  custom: "Custom",
};

const SECTION_TYPES = Object.keys(SECTION_TYPE_LABELS) as KbSectionType[];

export default function KnowledgeBasePage() {
  const { id: clientId } = useParams<{ id: string }>();
  const [sections, setSections] = useState<KbSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<Record<string, string>>({});
  const [editTitle, setEditTitle] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState<string | null>(null);
  const [versions, setVersions] = useState<KbVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSection, setNewSection] = useState<CreateKbSectionInput>({
    sectionType: "niche_overview",
    title: "",
    content: "",
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadSections();
  }, [clientId]);

  async function loadSections() {
    setLoading(true);
    setError(null);
    try {
      const { sections } = await listKbSections(clientId);
      setSections(sections);
    } catch {
      setError("Failed to load knowledge base sections");
    } finally {
      setLoading(false);
    }
  }

  function startEditing(section: KbSection) {
    setEditingSection(section.id);
    setEditContent((prev) => ({ ...prev, [section.id]: section.content }));
    setEditTitle((prev) => ({ ...prev, [section.id]: section.title }));
    setExpandedSection(section.id);
  }

  function cancelEditing(sectionId: string) {
    setEditingSection(null);
    setEditContent((prev) => {
      const next = { ...prev };
      delete next[sectionId];
      return next;
    });
  }

  async function handleSave(sectionId: string) {
    setSaving(sectionId);
    try {
      const { section } = await updateKbSection(clientId, sectionId, {
        title: editTitle[sectionId],
        content: editContent[sectionId],
      });
      setSections((prev) => prev.map((s) => (s.id === sectionId ? section : s)));
      setEditingSection(null);
    } catch {
      setError("Failed to save section");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(sectionId: string) {
    if (!confirm("Delete this section? This cannot be undone.")) return;
    try {
      await deleteKbSection(clientId, sectionId);
      setSections((prev) => prev.filter((s) => s.id !== sectionId));
      if (expandedSection === sectionId) setExpandedSection(null);
    } catch {
      setError("Failed to delete section");
    }
  }

  async function handleShowVersions(sectionId: string) {
    setShowVersions(sectionId);
    setVersionsLoading(true);
    try {
      const { versions } = await listKbVersions(clientId, sectionId);
      setVersions(versions);
    } catch {
      setError("Failed to load version history");
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRevert(sectionId: string, version: number) {
    if (!confirm(`Revert to version ${version}? This will create a new version with the old content.`)) return;
    try {
      const { section } = await revertKbSection(clientId, sectionId, version);
      setSections((prev) => prev.map((s) => (s.id === sectionId ? section : s)));
      setShowVersions(null);
    } catch {
      setError("Failed to revert section");
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newSection.title.trim()) return;
    setCreating(true);
    try {
      const { section } = await createKbSection(clientId, newSection);
      setSections((prev) => [...prev, section]);
      setShowCreateForm(false);
      setNewSection({ sectionType: "niche_overview", title: "", content: "" });
      setExpandedSection(section.id);
    } catch {
      setError("Failed to create section");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading knowledge base…</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <a href={`/clients/${clientId}`} className="text-sm text-gray-500 hover:text-gray-700">
            ← Client
          </a>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + Add Section
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {/* Create form modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add KB Section</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Section Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newSection.sectionType}
                    onChange={(e) =>
                      setNewSection((f) => ({ ...f, sectionType: e.target.value as KbSectionType }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {SECTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {SECTION_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={newSection.title}
                    onChange={(e) => setNewSection((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Section title…"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <TiptapEditor
                  content={newSection.content}
                  onChange={(html) => setNewSection((f) => ({ ...f, content: html }))}
                  placeholder="Enter section content…"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {creating ? "Creating…" : "Create Section"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Version history modal */}
      {showVersions && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Version History</h2>
              <button
                onClick={() => setShowVersions(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>
            {versionsLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-3">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="border border-gray-200 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-700">Version {v.version}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {new Date(v.createdAt).toLocaleString()} · {v.changeSource}
                        </span>
                        <button
                          onClick={() => handleRevert(showVersions, v.version)}
                          className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50 transition-colors"
                        >
                          Revert
                        </button>
                      </div>
                    </div>
                    <div
                      className="prose prose-sm max-w-none text-gray-600 line-clamp-3"
                      dangerouslySetInnerHTML={{ __html: v.content }}
                    />
                  </div>
                ))}
                {versions.length === 0 && (
                  <p className="text-sm text-gray-500">No version history yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sections list */}
      {sections.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-gray-500 text-sm mb-3">No knowledge base sections yet.</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="text-blue-600 text-sm font-medium hover:underline"
          >
            Add the first section
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => {
            const isExpanded = expandedSection === section.id;
            const isEditing = editingSection === section.id;

            return (
              <div
                key={section.id}
                className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
              >
                {/* Section header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() =>
                    setExpandedSection(isExpanded ? null : section.id)
                  }
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-block rounded-full bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 shrink-0">
                      {SECTION_TYPE_LABELS[section.sectionType]}
                    </span>
                    <span className="font-medium text-gray-900 truncate">{section.title}</span>
                    <span className="text-xs text-gray-400 shrink-0">v{section.version}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShowVersions(section.id);
                      }}
                      className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-100 transition-colors"
                    >
                      History
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditing) {
                          cancelEditing(section.id);
                        } else {
                          startEditing(section);
                        }
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50 transition-colors"
                    >
                      {isEditing ? "Cancel" : "Edit"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(section.id);
                      }}
                      className="text-xs text-red-500 hover:text-red-600 border border-red-100 rounded px-2 py-0.5 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                    <span className="text-gray-300">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Section body */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-4">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                          <input
                            value={editTitle[section.id] ?? section.title}
                            onChange={(e) =>
                              setEditTitle((prev) => ({
                                ...prev,
                                [section.id]: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Content</label>
                          <TiptapEditor
                            content={editContent[section.id] ?? section.content}
                            onChange={(html) =>
                              setEditContent((prev) => ({ ...prev, [section.id]: html }))
                            }
                            placeholder="Enter section content…"
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleSave(section.id)}
                            disabled={saving === section.id}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                          >
                            {saving === section.id ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => cancelEditing(section.id)}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="prose prose-sm max-w-none text-gray-700"
                        dangerouslySetInnerHTML={{ __html: section.content || "<p class='text-gray-400'>No content yet. Click Edit to add content.</p>" }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
