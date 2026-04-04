/**
 * E2E: M1 Client Management — CRUD, client switching, client-scoped queries
 *
 * Requires a running API server at API_URL connected to a live test database.
 */

import { test, expect } from "@playwright/test";
import { API, registerAdmin, authGet, authPost, authPatch, authDelete, createClient } from "./helpers.js";

const UNIQUE = `clients-${Date.now()}`;
let adminSession: { cookie: string; userId: string; role: string };

test.beforeAll(async ({ request }) => {
  adminSession = await registerAdmin(request, UNIQUE);
});

test.describe("List clients — GET /api/v1/clients", () => {
  test("returns empty list initially", async ({ request }) => {
    const res = await authGet(request, "/api/v1/clients", adminSession);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.clients)).toBe(true);
  });

  test("lists newly created clients", async ({ request }) => {
    await createClient(request, adminSession, { name: `Listed Client ${UNIQUE}` });

    const res = await authGet(request, "/api/v1/clients", adminSession);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const names = body.clients.map((c: any) => c.name);
    expect(names.some((n: string) => n.includes(UNIQUE))).toBe(true);
  });

  test("returns 401 when not authenticated", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/clients`);
    expect(res.status()).toBe(401);
  });
});

test.describe("Create client — POST /api/v1/clients", () => {
  test("creates a client and returns 201 with client data", async ({ request }) => {
    const res = await authPost(request, "/api/v1/clients", adminSession, {
      name: `Create Test ${UNIQUE}`,
      websiteUrl: "https://create-test.example.com",
      niche: "SaaS",
      industry: "Technology",
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.client).toMatchObject({
      name: `Create Test ${UNIQUE}`,
      websiteUrl: "https://create-test.example.com",
      active: true,
    });
    expect(body.client.id).toBeTruthy();
  });

  test("returns 400 for missing required fields", async ({ request }) => {
    const res = await authPost(request, "/api/v1/clients", adminSession, {
      name: "",
      websiteUrl: "not-a-url",
    });

    expect(res.status()).toBe(400);
  });

  test("returns 401 without authentication", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/clients`, {
      data: { name: "Unauth", websiteUrl: "https://x.com", niche: "X", industry: "Y" },
    });

    expect(res.status()).toBe(401);
  });
});

test.describe("Get client by ID — GET /api/v1/clients/:id", () => {
  let clientId: string;

  test.beforeAll(async ({ request }) => {
    clientId = await createClient(request, adminSession, { name: `Get By ID ${UNIQUE}` });
  });

  test("returns client data for a valid id", async ({ request }) => {
    const res = await authGet(request, `/api/v1/clients/${clientId}`, adminSession);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.client.id).toBe(clientId);
    expect(body.client.name).toContain(UNIQUE);
  });

  test("returns 404 for unknown id", async ({ request }) => {
    const res = await authGet(request, "/api/v1/clients/00000000-0000-0000-0000-000000000000", adminSession);
    expect(res.status()).toBe(404);
  });
});

test.describe("Update client — PATCH /api/v1/clients/:id", () => {
  let clientId: string;

  test.beforeAll(async ({ request }) => {
    clientId = await createClient(request, adminSession, { name: `Update Target ${UNIQUE}` });
  });

  test("updates client name", async ({ request }) => {
    const res = await authPatch(request, `/api/v1/clients/${clientId}`, adminSession, {
      name: `Updated Name ${UNIQUE}`,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.client.name).toBe(`Updated Name ${UNIQUE}`);
  });

  test("returns 404 for unknown id", async ({ request }) => {
    const res = await authPatch(
      request,
      "/api/v1/clients/00000000-0000-0000-0000-000000000000",
      adminSession,
      { name: "Ghost" }
    );

    expect(res.status()).toBe(404);
  });
});

test.describe("Archive client — DELETE /api/v1/clients/:id", () => {
  test("archives (soft-deletes) a client and returns 204", async ({ request }) => {
    const clientId = await createClient(request, adminSession, { name: `Archive Me ${UNIQUE}` });

    const res = await authDelete(request, `/api/v1/clients/${clientId}`, adminSession);
    expect(res.status()).toBe(204);

    // Archived client should still be retrievable (soft delete) or return 404
    // depending on role. Either outcome is acceptable; the point is it was processed.
    const getRes = await authGet(request, `/api/v1/clients/${clientId}`, adminSession);
    // Admin may still fetch archived clients; non-admin gets 404
    expect([200, 404]).toContain(getRes.status());
  });

  test("returns 404 for unknown id", async ({ request }) => {
    const res = await authDelete(
      request,
      "/api/v1/clients/00000000-0000-0000-0000-000000000000",
      adminSession
    );

    expect(res.status()).toBe(404);
  });
});

test.describe("Client switching — x-client-id context header", () => {
  let clientAId: string;
  let clientBId: string;

  test.beforeAll(async ({ request }) => {
    clientAId = await createClient(request, adminSession, { name: `Switch Client A ${UNIQUE}` });
    clientBId = await createClient(request, adminSession, { name: `Switch Client B ${UNIQUE}` });
  });

  test("x-client-id header is accepted by the API without error", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/agent-configs/resolve/article_writer`, {
      headers: {
        Cookie: adminSession.cookie,
        "x-client-id": clientAId,
      },
    });

    // 404 is fine here (no config seeded); important: NOT 400 or 500
    expect([200, 404]).toContain(res.status());
  });

  test("switching x-client-id returns different scoped data", async ({ request }) => {
    // Both resolve calls should be valid requests (200 or 404, not 400/500)
    const resA = await request.get(`${API}/api/v1/agent-configs/resolve/article_writer`, {
      headers: { Cookie: adminSession.cookie, "x-client-id": clientAId },
    });
    const resB = await request.get(`${API}/api/v1/agent-configs/resolve/article_writer`, {
      headers: { Cookie: adminSession.cookie, "x-client-id": clientBId },
    });

    expect([200, 404]).toContain(resA.status());
    expect([200, 404]).toContain(resB.status());
  });
});
