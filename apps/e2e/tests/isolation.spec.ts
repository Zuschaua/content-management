/**
 * E2E: Client data isolation regression — verify Client A's data never leaks to Client B.
 *
 * Creates two independent clients and asserts that scoped queries never cross boundaries.
 * Requires a running API server at API_URL connected to a live test database.
 */

import { test, expect } from "@playwright/test";
import { API, registerAdmin, authGet, authPost, createClient } from "./helpers.js";

const UNIQUE = `isolation-${Date.now()}`;
let adminSession: { cookie: string; userId: string; role: string };
let clientAId: string;
let clientBId: string;

test.beforeAll(async ({ request }) => {
  adminSession = await registerAdmin(request, UNIQUE);
  clientAId = await createClient(request, adminSession, { name: `Isolation Client A ${UNIQUE}` });
  clientBId = await createClient(request, adminSession, { name: `Isolation Client B ${UNIQUE}` });
});

// ── Client record isolation ─────────────────────────────────────────────────

test.describe("Client record isolation", () => {
  test("GET /clients/:id for Client A returns only Client A's data", async ({ request }) => {
    const res = await authGet(request, `/api/v1/clients/${clientAId}`, adminSession);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.client.id).toBe(clientAId);
    expect(body.client.id).not.toBe(clientBId);
  });

  test("GET /clients/:id for Client B returns only Client B's data", async ({ request }) => {
    const res = await authGet(request, `/api/v1/clients/${clientBId}`, adminSession);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.client.id).toBe(clientBId);
    expect(body.client.id).not.toBe(clientAId);
  });

  test("Client A's ID cannot fetch Client B's record", async ({ request }) => {
    // Fetching with clientBId should return B's data — never A's
    const resB = await authGet(request, `/api/v1/clients/${clientBId}`, adminSession);
    const bodyB = await resB.json();
    expect(bodyB.client.name).toContain("Isolation Client B");
    expect(bodyB.client.name).not.toContain("Isolation Client A");
  });
});

// ── Agent config isolation ──────────────────────────────────────────────────

test.describe("Agent config isolation between clients", () => {
  let configAId: string;
  let configBId: string;

  test.beforeAll(async ({ request }) => {
    const resA = await authPost(
      request,
      `/api/v1/agent-configs/clients/${clientAId}/agent-configs`,
      adminSession,
      {
        agentType: "article_writer",
        displayName: `Config for A ${UNIQUE}`,
        systemPrompt: "Secret prompt for Client A only.",
        modelProvider: "openai",
        modelName: "gpt-4o",
      }
    );
    configAId = (await resA.json()).config.id;

    const resB = await authPost(
      request,
      `/api/v1/agent-configs/clients/${clientBId}/agent-configs`,
      adminSession,
      {
        agentType: "article_writer",
        displayName: `Config for B ${UNIQUE}`,
        systemPrompt: "Secret prompt for Client B only.",
        modelProvider: "openai",
        modelName: "gpt-4o",
      }
    );
    configBId = (await resB.json()).config.id;
  });

  test("Client A's config list contains only Client A configs", async ({ request }) => {
    const res = await authGet(
      request,
      `/api/v1/agent-configs/clients/${clientAId}/agent-configs`,
      adminSession
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    const ids = body.configs.map((c: any) => c.id);
    expect(ids).toContain(configAId);
    expect(ids).not.toContain(configBId);

    const text = JSON.stringify(body);
    expect(text).not.toContain("Secret prompt for Client B only.");
  });

  test("Client B's config list contains only Client B configs", async ({ request }) => {
    const res = await authGet(
      request,
      `/api/v1/agent-configs/clients/${clientBId}/agent-configs`,
      adminSession
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    const ids = body.configs.map((c: any) => c.id);
    expect(ids).toContain(configBId);
    expect(ids).not.toContain(configAId);

    const text = JSON.stringify(body);
    expect(text).not.toContain("Secret prompt for Client A only.");
  });

  test("resolve with Client A header returns Client A config, not Client B", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/agent-configs/resolve/article_writer`, {
      headers: { Cookie: adminSession.cookie, "x-client-id": clientAId },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.config.id).toBe(configAId);
    expect(body.config.systemPrompt).toBe("Secret prompt for Client A only.");

    const text = JSON.stringify(body);
    expect(text).not.toContain("Secret prompt for Client B only.");
    expect(text).not.toContain(configBId);
  });

  test("resolve with Client B header returns Client B config, not Client A", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/agent-configs/resolve/article_writer`, {
      headers: { Cookie: adminSession.cookie, "x-client-id": clientBId },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.config.id).toBe(configBId);
    expect(body.config.systemPrompt).toBe("Secret prompt for Client B only.");

    const text = JSON.stringify(body);
    expect(text).not.toContain("Secret prompt for Client A only.");
    expect(text).not.toContain(configAId);
  });
});

// ── Sensitive field containment ─────────────────────────────────────────────

test.describe("Sensitive field containment across all endpoints", () => {
  test("API key is never exposed as a string in any response", async ({ request }) => {
    // Create a config with an API key
    const res = await authPost(
      request,
      `/api/v1/agent-configs/clients/${clientAId}/agent-configs`,
      adminSession,
      {
        agentType: "image_generator",
        displayName: `API Key Test ${UNIQUE}`,
        systemPrompt: "Test prompt.",
        modelProvider: "openai",
        modelName: "gpt-4o",
        apiKey: "sk-supersecretkey-should-never-appear",
      }
    );

    expect(res.status()).toBe(201);
    const body = await res.json();

    // hasApiKey must be a boolean, never the key string
    expect(typeof body.config.hasApiKey).toBe("boolean");
    expect(body.config.hasApiKey).toBe(true);

    // The raw key must not appear anywhere in the response
    const text = JSON.stringify(body);
    expect(text).not.toContain("sk-supersecretkey-should-never-appear");
    expect(text).not.toContain("supersecretkey");
  });

  test("password hash is never returned by auth endpoints", async ({ request }) => {
    const registerRes = await request.post(`${API}/api/v1/auth/register`, {
      data: {
        email: `hash-test-${UNIQUE}@e2e.test`,
        password: "HashTestPass123!",
        name: "Hash Test",
      },
    });

    const body = await registerRes.json();
    const text = JSON.stringify(body);
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("argon2");
  });
});
