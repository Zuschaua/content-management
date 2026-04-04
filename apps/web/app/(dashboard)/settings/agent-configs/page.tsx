"use client";

import { useEffect, useState } from "react";
import {
  listGlobalAgentConfigs,
  listClientAgentConfigs,
  createGlobalAgentConfig,
  createClientAgentConfig,
  updateAgentConfig,
  deleteAgentConfig,
  listAgentConfigVersions,
  rollbackAgentConfig,
  getActiveClientId,
  listClients,
  type AgentConfig,
  type AgentType,
  type AgentPromptVersion,
  type CreateAgentConfigInput,
  type Client,
} from "../../../../lib/api";

const AGENT_TYPES = [
  "website_analyzer",
  "blog_tracker",
  "competitor_analyzer",
  "suggestion_engine",
  "article_writer",
  "image_generator",
] as const;

const AGENT_TYPE_LABELS: Record<string, string> = {
  website_analyzer: "Website Analyzer",
  blog_tracker: "Blog Tracker",
  competitor_analyzer: "Competitor Analyzer",
  suggestion_engine: "Suggestion Engine",
  article_writer: "Article Writer",
  image_generator: "Image Generator",
};

const MODEL_PROVIDERS = ["openai", "anthropic", "google", "custom"];

type FormState = Partial<CreateAgentConfigInput>;

const emptyForm: FormState = {
  agentType: "article_writer",
  displayName: "",
  systemPrompt: "",
  modelProvider: "anthropic",
  modelName: "",
  baseUrl: "",
  apiKey: "",
  temperature: 0.7,
  maxTokens: undefined,
};

export default function AgentConfigsPage() {
  const [globalConfigs, setGlobalConfigs] = useState<AgentConfig[]>([]);
  const [clientConfigs, setClientConfigs] = useState<AgentConfig[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create/edit modal
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AgentConfig | null>(null);
  const [isClientScoped, setIsClientScoped] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Version history panel
  const [versionsConfig, setVersionsConfig] = useState<AgentConfig | null>(null);
  const [versions, setVersions] = useState<AgentPromptVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const clientId = getActiveClientId();
    setSelectedClientId(clientId);
    load(clientId);
    loadClients();
  }, []);

  async function load(clientId: string | null) {
    setLoading(true);
    setError(null);
    try {
      const [{ configs: g }] = await Promise.all([listGlobalAgentConfigs()]);
      setGlobalConfigs(g);
      if (clientId) {
        const { configs: c } = await listClientAgentConfigs(clientId);
        setClientConfigs(c);
      } else {
        setClientConfigs([]);
      }
    } catch {
      setError("Failed to load agent configurations.");
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    try {
      const { clients: c } = await listClients();
      setClients(c.filter((cl) => cl.active));
    } catch {
      // ignore
    }
  }

  function openCreate(forClient: boolean) {
    setEditingConfig(null);
    setIsClientScoped(forClient);
    setForm(emptyForm);
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(config: AgentConfig) {
    setEditingConfig(config);
    setIsClientScoped(!!config.clientId);
    setForm({
      agentType: config.agentType,
      displayName: config.displayName,
      systemPrompt: config.systemPrompt,
      modelProvider: config.modelProvider,
      modelName: config.modelName,
      baseUrl: config.baseUrl ?? "",
      apiKey: "",
      temperature: config.temperature ? parseFloat(config.temperature as string) : 0.7,
      maxTokens: config.maxTokens ?? undefined,
    });
    setSaveError(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.displayName || !form.systemPrompt || !form.modelProvider || !form.modelName) {
      setSaveError("Display name, system prompt, model provider, and model name are required.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (editingConfig) {
        const { config } = await updateAgentConfig(editingConfig.id, {
          displayName: form.displayName,
          systemPrompt: form.systemPrompt,
          modelProvider: form.modelProvider,
          modelName: form.modelName,
          baseUrl: form.baseUrl || undefined,
          apiKey: form.apiKey || undefined,
          temperature: form.temperature,
          maxTokens: form.maxTokens,
        });
        if (config.clientId) {
          setClientConfigs((prev) =>
            prev.map((c) => (c.id === config.id ? config : c))
          );
        } else {
          setGlobalConfigs((prev) =>
            prev.map((c) => (c.id === config.id ? config : c))
          );
        }
      } else {
        const payload: CreateAgentConfigInput = {
          agentType: form.agentType as CreateAgentConfigInput["agentType"],
          displayName: form.displayName!,
          systemPrompt: form.systemPrompt!,
          modelProvider: form.modelProvider!,
          modelName: form.modelName!,
          baseUrl: form.baseUrl || undefined,
          apiKey: form.apiKey || undefined,
          temperature: form.temperature,
          maxTokens: form.maxTokens,
        };
        if (isClientScoped && selectedClientId) {
          const { config } = await createClientAgentConfig(selectedClientId, payload);
          setClientConfigs((prev) => [...prev, config]);
        } else {
          const { config } = await createGlobalAgentConfig(payload);
          setGlobalConfigs((prev) => [...prev, config]);
        }
      }
      setShowForm(false);
    } catch (e: unknown) {
      const err = e as { body?: { error?: string | { formErrors?: string[] } } };
      const msg = err?.body?.error;
      setSaveError(
        typeof msg === "string"
          ? msg
          : Array.isArray((msg as { formErrors?: string[] })?.formErrors)
          ? (msg as { formErrors: string[] }).formErrors.join(", ")
          : "Failed to save configuration."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAgentConfig(id);
      setGlobalConfigs((prev) => prev.filter((c) => c.id !== id));
      setClientConfigs((prev) => prev.filter((c) => c.id !== id));
      setDeletingId(null);
    } catch {
      setError("Failed to delete configuration.");
    }
  }

  async function openVersions(config: AgentConfig) {
    setVersionsConfig(config);
    setVersionsLoading(true);
    setVersions([]);
    try {
      const { versions: v } = await listAgentConfigVersions(config.id);
      setVersions(v);
    } catch {
      // ignore
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRollback(version: number) {
    if (!versionsConfig) return;
    setRollingBack(true);
    try {
      const { config } = await rollbackAgentConfig(versionsConfig.id, version);
      if (config.clientId) {
        setClientConfigs((prev) =>
          prev.map((c) => (c.id === config.id ? config : c))
        );
      } else {
        setGlobalConfigs((prev) =>
          prev.map((c) => (c.id === config.id ? config : c))
        );
      }
      setVersionsConfig(config);
      const { versions: v } = await listAgentConfigVersions(config.id);
      setVersions(v);
    } catch {
      // ignore
    } finally {
      setRollingBack(false);
    }
  }

  const activeClient = clients.find((c) => c.id === selectedClientId);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Configurations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage AI agent models, system prompts, and per-client overrides.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Global Configs */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Global Defaults</h2>
          <button
            onClick={() => openCreate(false)}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700"
          >
            + Add Global Config
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : globalConfigs.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No global configs yet.</p>
        ) : (
          <div className="space-y-3">
            {globalConfigs.map((config) => (
              <ConfigCard
                key={config.id}
                config={config}
                onEdit={() => openEdit(config)}
                onDelete={() => setDeletingId(config.id)}
                onVersions={() => openVersions(config)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Client-Specific Configs */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Client Overrides</h2>
            <select
              value={selectedClientId ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setSelectedClientId(v);
                load(v);
              }}
              className="text-sm border border-gray-300 rounded-md px-2 py-1"
            >
              <option value="">— select client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {selectedClientId && (
            <button
              onClick={() => openCreate(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              + Add for {activeClient?.name ?? "Client"}
            </button>
          )}
        </div>

        {!selectedClientId ? (
          <p className="text-sm text-gray-500 italic">Select a client to view or add overrides.</p>
        ) : loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : clientConfigs.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No overrides for this client. Global defaults apply.
          </p>
        ) : (
          <div className="space-y-3">
            {clientConfigs.map((config) => (
              <ConfigCard
                key={config.id}
                config={config}
                onEdit={() => openEdit(config)}
                onDelete={() => setDeletingId(config.id)}
                onVersions={() => openVersions(config)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingConfig ? "Edit Configuration" : `New ${isClientScoped ? "Client" : "Global"} Configuration`}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                ×
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {saveError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  {saveError}
                </div>
              )}

              {!editingConfig && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agent Type</label>
                  <select
                    value={form.agentType}
                    onChange={(e) => setForm({ ...form, agentType: e.target.value as AgentType })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    {AGENT_TYPES.map((t) => (
                      <option key={t} value={t}>{AGENT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. Article Writer (Claude)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model Provider</label>
                  <select
                    value={form.modelProvider}
                    onChange={(e) => setForm({ ...form, modelProvider: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    {MODEL_PROVIDERS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                  <input
                    type="text"
                    value={form.modelName}
                    onChange={(e) => setForm({ ...form, modelName: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. claude-3-5-sonnet-20241022"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  System Prompt
                </label>
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  rows={8}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                  placeholder="You are a professional SEO content writer…"
                />
                {editingConfig && (
                  <p className="text-xs text-gray-400 mt-1">
                    Editing the prompt will create a new version (current: v{editingConfig.version}).
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base URL <span className="text-gray-400">(optional, for custom endpoints)</span>
                </label>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key <span className="text-gray-400">(leave blank to keep existing)</span>
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="sk-…"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.05"
                    value={form.temperature}
                    onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Tokens <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.maxTokens ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        maxTokens: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="4096"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : editingConfig ? "Save Changes" : "Create Config"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Configuration</h3>
              <p className="text-sm text-gray-600">
                Are you sure? This will permanently delete the config and all version history.
              </p>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Panel */}
      {versionsConfig && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Prompt History</h3>
                <p className="text-xs text-gray-500">{versionsConfig.displayName} — current v{versionsConfig.version}</p>
              </div>
              <button onClick={() => setVersionsConfig(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {versionsLoading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : versions.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No version history.</p>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        Version {v.version}
                        {v.version === versionsConfig.version && (
                          <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                            current
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                        {v.version !== versionsConfig.version && (
                          <button
                            onClick={() => handleRollback(v.version)}
                            disabled={rollingBack}
                            className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 disabled:opacity-50"
                          >
                            {rollingBack ? "Rolling back…" : "Rollback"}
                          </button>
                        )}
                      </div>
                    </div>
                    <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                      {v.systemPrompt}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigCard({
  config,
  onEdit,
  onDelete,
  onVersions,
}: {
  config: AgentConfig;
  onEdit: () => void;
  onDelete: () => void;
  onVersions: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{config.displayName}</span>
            <span className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded-full">
              {AGENT_TYPE_LABELS[config.agentType] ?? config.agentType}
            </span>
            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
              {config.modelProvider}/{config.modelName}
            </span>
            <span className="text-xs text-gray-400">v{config.version}</span>
            {config.hasApiKey && (
              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                API key set
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500 line-clamp-2 font-mono">
            {config.systemPrompt}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onVersions}
            title="View prompt history"
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded hover:bg-gray-50"
          >
            History
          </button>
          <button
            onClick={onEdit}
            className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded hover:bg-blue-50"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
