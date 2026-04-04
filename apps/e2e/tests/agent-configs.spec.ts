/**
 * E2E: M10 System Prompts — agent config CRUD, versioning, client override cascade
 *
 * Requires a running API server at API_URL connected to a live test database.
 */

import { test, expect } from "@playwright/test";
import { API, registerAdmin, authGet, authPost, authPatch, authDelete, createClient } from "./helpers.js";

const UNIQUE = `agentcfg-${Date.now()}`;
let adminSession: { cookie: string; userId: string; role: string };
let clientId: string;

test.beforeAll(async ({ request }) => {
  adminSession = await registerAdmin(request, UNIQUE);
  clientId = await createClient(request, adminSession, { name: `Config Owner ${UNIQUE}` });
});

// ── Global config CRUD ──────────────────────────────────────────────────────

test.describe("Global agent configs — CRUD", () => {
  let configId: string;

  test("POST /agent-configs/global — creates a global config", async ({ request }) => {
    const res = await authPost(request, "/api/v1/agent-configs/global", adminSession, {
      agentType: "article_writer",
      displayName: `Global Writer ${UNIQUE}`,
      systemPrompt: "You are a global content writer.",
      modelProvider: "openai",
      modelName: "gpt-4o",
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.config.agentType).toBe("article_writer");
    expect(body.config.clientId).toBeNull();
    expect(body.config.version).toBe(1);
    // API key must never be leaked
    expect(typeof body.config.hasApiKey).toBe("boolean");
    configId = body.config.id;
  });

  test("GET /agent-configs/global — lists global configs", async ({ request }) => {
    const res = await authGet(request, "/api/v1/agent-configs/global", adminSession);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.configs)).toBe(true);
    const ids = body.configs.map((c: any) => c.id);
    expect(ids).toContain(configId);
  });

  test("GET /agent-configs/:id — returns the config by id", async ({ request }) => {
    const res = await authGet(request, `/api/v1/agent-configs/${configId}`, adminSession);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.config.id).toBe(configId);
  });

  test("PATCH /agent-configs/:id — updates display name without bumping version", async ({ request }) => {
    const res = await authPatch(request, `/api/v1/agent-configs/${configId}`, adminSession, {
      displayName: `Updated Name ${UNIQUE}`,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.config.displayName).toBe(`Updated Name ${UNIQUE}`);
    expect(body.config.version).toBe(1); // unchanged
  });

  test("DELETE /agent-configs/:id — deletes the config and returns 204", async ({ request }) => {
    // Create a throwaway config to delete
    const createRes = await authPost(request, "/api/v1/agent-configs/global", adminSession, {
      agentType: "blog_tracker",
      displayName: `Deletable ${UNIQUE}`,
      systemPrompt: "Delete me.",
      modelProvider: "openai",
      modelName: "gpt-4o-mini",
    });
    const toDelete = (await createRes.json()).config.id;

    const res = await authDelete(request, `/api/v1/agent-configs/${toDelete}`, adminSession);
    expect(res.status()).toBe(204);

    const getRes = await authGet(request, `/api/v1/agent-configs/${toDelete}`, adminSession);
    expect(getRes.status()).toBe(404);
  });
});

// ── System prompt versioning ────────────────────────────────────────────────

test.describe("System prompt versioning", () => {
  let configId: string;

  test.beforeAll(async ({ request }) => {
    const res = await authPost(request, "/api/v1/agent-configs/global", adminSession, {
      agentType: "suggestion_engine",
      displayName: `Versioned Config ${UNIQUE}`,
      systemPrompt: "Version 1 prompt.",
      modelProvider: "openai",
      modelName: "gpt-4o",
    });
    configId = (await res.json()).config.id;
  });

  test("updating system prompt bumps version to 2", async ({ request }) => {
    const res = await authPatch(request, `/api/v1/agent-configs/${configId}`, adminSession, {
      systemPrompt: "Version 2 prompt.",
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.config.version).toBe(2);
    expect(body.config.systemPrompt).toBe("Version 2 prompt.");
  });

  test("GET /agent-configs/:id/versions — returns version history", async ({ request }) => {
    const res = await authGet(request, `/api/v1/agent-configs/${configId}/versions`, adminSession);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.versions.length).toBeGreaterThanOrEqual(2);
    // Versions are ordered descending
    expect(body.versions[0].version).toBeGreaterThan(body.versions[1].version);
  });

  test("POST /agent-configs/:id/rollback — rolls back to version 1", async ({ request }) => {
    // Update again to create version 3
    await authPatch(request, `/api/v1/agent-configs/${configId}`, adminSession, {
      systemPrompt: "Version 3 prompt.",
    });

    const res = await authPost(
      request,
      `/api/v1/agent-configs/${configId}/rollback`,
      adminSession,
      { version: 1 }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.config.systemPrompt).toBe("Version 1 prompt.");
    expect(body.config.version).toBe(4); // rollback creates a new version entry
  });

  test("rollback to non-existent version returns 404", async ({ request }) => {
    const res = await authPost(
      request,
      `/api/v1/agent-configs/${configId}/rollback`,
      adminSession,
      { version: 9999 }
    );

    expect(res.status()).toBe(404);
  });
});

// ── Client-specific configs ─────────────────────────────────────────────────

test.describe("Client-specific agent configs", () => {
  let clientConfigId: string;

  test("POST /agent-configs/clients/:clientId/agent-configs — creates client config", async ({ request }) => {
    const res = await authPost(
      request,
      `/api/v1/agent-configs/clients/${clientId}/agent-configs`,
      adminSession,
      {
        agentType: "article_writer",
        displayName: `Client Writer ${UNIQUE}`,
        systemPrompt: "Client-specific writer prompt.",
        modelProvider: "openai",
        modelName: "gpt-4o",
      }
    );

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.config.clientId).toBe(clientId);
    clientConfigId = body.config.id;
  });

  test("GET /agent-configs/clients/:clientId/agent-configs — lists client configs", async ({ request }) => {
    const res = await authGet(
      request,
      `/api/v1/agent-configs/clients/${clientId}/agent-configs`,
      adminSession
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    const ids = body.configs.map((c: any) => c.id);
    expect(ids).toContain(clientConfigId);
    // All returned configs must belong to this client
    body.configs.forEach((c: any) => {
      expect(c.clientId).toBe(clientId);
    });
  });

  test("GET /agent-configs/clients/:clientId/agent-configs — returns 404 for unknown client", async ({ request }) => {
    const res = await authGet(
      request,
      "/api/v1/agent-configs/clients/00000000-0000-0000-0000-000000000000/agent-configs",
      adminSession
    );

    expect(res.status()).toBe(404);
  });
});

// ── Config cascade (resolve) ────────────────────────────────────────────────

test.describe("Client override cascade — GET /agent-configs/resolve/:agentType", () => {
  let globalConfigId: string;
  let overrideClientId: string;

  test.beforeAll(async ({ request }) => {
    // Unique agent type to avoid collisions with other test runs
    const agentType = "website_analyzer";

    // Create a global config
    const globalRes = await authPost(request, "/api/v1/agent-configs/global", adminSession, {
      agentType,
      displayName: `Cascade Global ${UNIQUE}`,
      systemPrompt: "Global cascade prompt.",
      modelProvider: "openai",
      modelName: "gpt-4o",
    });
    globalConfigId = (await globalRes.json()).config.id;

    // Create a client for override testing
    overrideClientId = await createClient(request, adminSession, { name: `Cascade Client ${UNIQUE}` });

    // Create client-specific override
    await authPost(
      request,
      `/api/v1/agent-configs/clients/${overrideClientId}/agent-configs`,
      adminSession,
      {
        agentType,
        displayName: `Cascade Client Override ${UNIQUE}`,
        systemPrompt: "Client override prompt.",
        modelProvider: "openai",
        modelName: "gpt-4o",
      }
    );
  });

  test("returns global config when no x-client-id header", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/agent-configs/resolve/website_analyzer`, {
      headers: { Cookie: adminSession.cookie },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.config.id).toBe(globalConfigId);
    expect(body.config.systemPrompt).toBe("Global cascade prompt.");
  });

  test("returns client-specific config when x-client-id matches an override", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/agent-configs/resolve/website_analyzer`, {
      headers: { Cookie: adminSession.cookie, "x-client-id": overrideClientId },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.config.clientId).toBe(overrideClientId);
    expect(body.config.systemPrompt).toBe("Client override prompt.");
  });

  test("falls back to global when client has no override", async ({ request }) => {
    // clientId has no website_analyzer override (only article_writer from earlier test)
    const res = await request.get(`${API}/api/v1/agent-configs/resolve/website_analyzer`, {
      headers: { Cookie: adminSession.cookie, "x-client-id": clientId },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.config.id).toBe(globalConfigId);
  });
});
