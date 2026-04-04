"use client";

import { useState, useEffect, FormEvent } from "react";
import {
  listClients,
  createClient,
  archiveClient,
  setActiveClientId,
  getActiveClientId,
  type Client,
  type CreateClientInput,
} from "../../../lib/api";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateClientInput>({
    name: "",
    websiteUrl: "",
    niche: "",
    industry: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveId(getActiveClientId());
    listClients()
      .then((r) => setClients(r.clients))
      .catch(() => setError("Failed to load clients"))
      .finally(() => setLoading(false));
  }, []);

  function handleSelectClient(id: string) {
    setActiveClientId(id);
    setActiveId(id);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { client } = await createClient({
        name: form.name,
        websiteUrl: form.websiteUrl,
        niche: form.niche || undefined,
        industry: form.industry || undefined,
        notes: form.notes || undefined,
      });
      setClients((prev) => [client, ...prev]);
      setShowCreate(false);
      setForm({ name: "", websiteUrl: "", niche: "", industry: "", notes: "" });
    } catch (err: any) {
      setError(err?.body?.error ?? "Failed to create client");
    }
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this client? All data will be retained.")) return;
    try {
      await archiveClient(id);
      setClients((prev) =>
        prev.map((c) => (c.id === id ? { ...c, active: false } : c))
      );
      if (activeId === id) {
        setActiveClientId(null);
        setActiveId(null);
      }
    } catch (err: any) {
      setError(err?.body?.error ?? "Failed to archive client");
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          {showCreate ? "Cancel" : "New Client"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6 space-y-4"
        >
          <h2 className="font-semibold text-gray-900">New Client</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Website URL <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="url"
                value={form.websiteUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, websiteUrl: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="https://acme.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Niche
              </label>
              <input
                value={form.niche}
                onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. SaaS, E-commerce"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Industry
              </label>
              <input
                value={form.industry}
                onChange={(e) =>
                  setForm((f) => ({ ...f, industry: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. Technology, Healthcare"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Create Client
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {clients.map((client) => (
            <div
              key={client.id}
              className={`bg-white rounded-xl border p-5 shadow-sm flex items-start gap-4 ${
                activeId === client.id
                  ? "border-blue-500 ring-1 ring-blue-500"
                  : "border-gray-200"
              } ${!client.active ? "opacity-60" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {client.name}
                  </h3>
                  {!client.active && (
                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      Archived
                    </span>
                  )}
                  {activeId === client.id && (
                    <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Active
                    </span>
                  )}
                </div>
                <a
                  href={client.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline truncate block"
                >
                  {client.websiteUrl}
                </a>
                {(client.niche || client.industry) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {[client.niche, client.industry].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {client.active && activeId !== client.id && (
                  <button
                    onClick={() => handleSelectClient(client.id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Select
                  </button>
                )}
                <a
                  href={`/clients/${client.id}`}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Edit
                </a>
                {client.active && (
                  <button
                    onClick={() => handleArchive(client.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
          ))}
          {clients.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 mb-3">No clients yet.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="text-sm text-blue-600 hover:underline"
              >
                Create your first client
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
