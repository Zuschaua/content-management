"use client";

import { useState, useEffect, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { getClient, updateClient, archiveClient, type Client } from "../../../../lib/api";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    name: "",
    websiteUrl: "",
    niche: "",
    industry: "",
    notes: "",
    contactEmail: "",
    contactPhone: "",
  });

  useEffect(() => {
    getClient(id)
      .then(({ client }) => {
        setClient(client);
        setForm({
          name: client.name,
          websiteUrl: client.websiteUrl,
          niche: client.niche ?? "",
          industry: client.industry ?? "",
          notes: client.notes ?? "",
          contactEmail: client.contactInfo?.email ?? "",
          contactPhone: client.contactInfo?.phone ?? "",
        });
      })
      .catch(() => setError("Client not found"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const { client: updated } = await updateClient(id, {
        name: form.name,
        websiteUrl: form.websiteUrl,
        niche: form.niche || undefined,
        industry: form.industry || undefined,
        notes: form.notes || undefined,
        contactInfo:
          form.contactEmail || form.contactPhone
            ? { email: form.contactEmail || undefined, phone: form.contactPhone || undefined }
            : undefined,
      });
      setClient(updated);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.body?.error ?? "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!confirm("Archive this client? All data will be retained.")) return;
    try {
      await archiveClient(id);
      router.push("/clients");
    } catch (err: any) {
      setError(err?.body?.error ?? "Failed to archive client");
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600">{error ?? "Client not found"}</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/clients" className="text-sm text-gray-500 hover:text-gray-700">
          ← Clients
        </a>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
        {!client.active && (
          <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            Archived
          </span>
        )}
      </div>

      {/* Quick nav */}
      <div className="flex gap-2 mb-6">
        <a
          href={`/clients/${id}/knowledge-base`}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Knowledge Base &rarr;
        </a>
        <a
          href={`/clients/${id}/suggestions`}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Suggestions &rarr;
        </a>
      </div>

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

      <form
        onSubmit={handleSave}
        className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4"
      >
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
              onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Niche</label>
            <input
              value={form.niche}
              onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
            <input
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Email
            </label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Phone
            </label>
            <input
              type="tel"
              value={form.contactPhone}
              onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
          {client.active && (
            <button
              type="button"
              onClick={handleArchive}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Archive Client
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
