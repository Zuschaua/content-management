import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock crypto lib (encrypt/decrypt)
vi.mock("../lib/crypto.js", () => ({
  encrypt: vi.fn((val: string) => `enc:${val}`),
  decrypt: vi.fn((val: string) => val.replace("enc:", "")),
}));

// Mock authenticate plugin
vi.mock("../plugins/authenticate.js", () => ({
  requireAuth: vi.fn(async () => {}),
  requireRole: vi.fn(() => async () => {}),
}));

import Fastify from "fastify";
import { agentConfigRoutes } from "./agent-configs.js";
import { db } from "../db/index.js";

const adminUser = { userId: "user-1", role: "admin" as const, name: "Admin", email: "admin@test.com" };

function buildApp(user = adminUser) {
  const app = Fastify({ logger: false });
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => { req.user = user; });
  app.register(agentConfigRoutes, { prefix: "/api/v1/agent-configs" });
  return app;
}

const mockConfig = {
  id: "config-1",
  agentType: "article_writer",
  clientId: null,
  displayName: "Article Writer",
  systemPrompt: "You are an expert content writer.",
  modelProvider: "openai",
  modelName: "gpt-4o",
  baseUrl: null,
  hasApiKey: null, // gets sanitized to false
  temperature: "0.7",
  maxTokens: 2000,
  extraConfig: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockClientConfig = { ...mockConfig, id: "config-2", clientId: "client-1" };

// ── Global configs ──────────────────────────────────────────────────────────

describe("GET /api/v1/agent-configs/global", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns list of global configs", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([mockConfig]),
    };
    (db.select as any).mockReturnValue(chain);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/agent-configs/global" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.configs).toHaveLength(1);
    expect(body.configs[0].agentType).toBe("article_writer");
    // API key must never be returned as string — only boolean flag
    expect(typeof body.configs[0].hasApiKey).toBe("boolean");
  });
});

describe("POST /api/v1/agent-configs/global", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a global config and returns 201", async () => {
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([mockConfig]),
    };
    const insertVersionChain = {
      values: vi.fn().mockResolvedValue([]),
    };
    (db.insert as any)
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(insertVersionChain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent-configs/global",
      payload: {
        agentType: "article_writer",
        displayName: "Article Writer",
        systemPrompt: "You are an expert content writer.",
        modelProvider: "openai",
        modelName: "gpt-4o",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.config.agentType).toBe("article_writer");
  });

  it("returns 400 for invalid payload", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent-configs/global",
      payload: { agentType: "unknown_type_xyz" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("does not expose raw API key in response", async () => {
    const configWithKey = { ...mockConfig, hasApiKey: "enc:sk-secret123" };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([configWithKey]),
    };
    const insertVersionChain = { values: vi.fn().mockResolvedValue([]) };
    (db.insert as any)
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(insertVersionChain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent-configs/global",
      payload: {
        agentType: "article_writer",
        displayName: "Article Writer",
        systemPrompt: "You are an expert content writer.",
        modelProvider: "openai",
        modelName: "gpt-4o",
        apiKey: "sk-secret123",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    // hasApiKey must be boolean true, never the key string
    expect(body.config.hasApiKey).toBe(true);
    expect(JSON.stringify(body)).not.toContain("sk-secret123");
  });
});

// ── Get/update/delete single config ────────────────────────────────────────

describe("GET /api/v1/agent-configs/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a single config by id", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockConfig]),
    };
    (db.select as any).mockReturnValue(chain);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/agent-configs/config-1" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.id).toBe("config-1");
  });

  it("returns 404 when config not found", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    (db.select as any).mockReturnValue(chain);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/agent-configs/nonexistent" });

    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /api/v1/agent-configs/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates display name without bumping prompt version", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ version: 1, systemPrompt: "Original prompt." }]),
    };
    const updated = { ...mockConfig, displayName: "Updated Name" };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    (db.select as any).mockReturnValue(selectChain);
    (db.update as any).mockReturnValue(updateChain);

    const app = buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/agent-configs/config-1",
      payload: { displayName: "Updated Name" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.displayName).toBe("Updated Name");
    // No version insert expected for display-name-only update
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("bumps version and records history when system prompt changes", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ version: 1, systemPrompt: "Old prompt." }]),
    };
    const updated = { ...mockConfig, systemPrompt: "New prompt.", version: 2 };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    const insertVersionChain = { values: vi.fn().mockResolvedValue([]) };
    (db.select as any).mockReturnValue(selectChain);
    (db.update as any).mockReturnValue(updateChain);
    (db.insert as any).mockReturnValue(insertVersionChain);

    const app = buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/agent-configs/config-1",
      payload: { systemPrompt: "New prompt." },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.version).toBe(2);
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("returns 404 when config not found", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    (db.select as any).mockReturnValue(selectChain);

    const app = buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/agent-configs/nonexistent",
      payload: { displayName: "Nope" },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/v1/agent-configs/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes config and returns 204", async () => {
    const deleteChain = {
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "config-1" }]),
    };
    (db.delete as any).mockReturnValue(deleteChain);

    const app = buildApp();
    const res = await app.inject({ method: "DELETE", url: "/api/v1/agent-configs/config-1" });

    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when config not found", async () => {
    const deleteChain = {
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    (db.delete as any).mockReturnValue(deleteChain);

    const app = buildApp();
    const res = await app.inject({ method: "DELETE", url: "/api/v1/agent-configs/nonexistent" });

    expect(res.statusCode).toBe(404);
  });
});

// ── Versioning ─────────────────────────────────────────────────────────────

describe("GET /api/v1/agent-configs/:id/versions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns version history for a config", async () => {
    const mockVersions = [
      { id: "v2", agentConfigId: "config-1", version: 2, systemPrompt: "New prompt.", changedBy: "user-1", createdAt: new Date() },
      { id: "v1", agentConfigId: "config-1", version: 1, systemPrompt: "Old prompt.", changedBy: "user-1", createdAt: new Date() },
    ];

    // First select: check config exists
    const configChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "config-1" }]),
    };
    // Second select: get versions
    const versionsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockVersions),
    };
    (db.select as any)
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(versionsChain);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/agent-configs/config-1/versions" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.versions).toHaveLength(2);
    expect(body.versions[0].version).toBe(2);
    expect(body.versions[1].version).toBe(1);
  });

  it("returns 404 when config not found", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    (db.select as any).mockReturnValue(chain);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/agent-configs/nonexistent/versions" });

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/v1/agent-configs/:id/rollback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rolls back to a previous version and bumps version number", async () => {
    const versionRow = { systemPrompt: "Old prompt." };
    const currentRow = { version: 3 };
    const updated = { ...mockConfig, systemPrompt: "Old prompt.", version: 4 };

    const versionSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([versionRow]),
    };
    const currentSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([currentRow]),
    };
    const insertVersionChain = { values: vi.fn().mockResolvedValue([]) };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };

    (db.select as any)
      .mockReturnValueOnce(versionSelectChain)
      .mockReturnValueOnce(currentSelectChain);
    (db.insert as any).mockReturnValue(insertVersionChain);
    (db.update as any).mockReturnValue(updateChain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent-configs/config-1/rollback",
      payload: { version: 1 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.systemPrompt).toBe("Old prompt.");
    expect(body.config.version).toBe(4);
  });

  it("returns 404 when target version does not exist", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    (db.select as any).mockReturnValue(chain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agent-configs/config-1/rollback",
      payload: { version: 99 },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ── Client-scoped configs ───────────────────────────────────────────────────

describe("GET /api/v1/agent-configs/clients/:clientId/agent-configs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns configs for the given client", async () => {
    const clientChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "client-1" }]),
    };
    const configsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([mockClientConfig]),
    };
    (db.select as any)
      .mockReturnValueOnce(clientChain)
      .mockReturnValueOnce(configsChain);

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/agent-configs/clients/client-1/agent-configs",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.configs).toHaveLength(1);
    expect(body.configs[0].clientId).toBe("client-1");
  });

  it("returns 404 when client does not exist", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    (db.select as any).mockReturnValue(chain);

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/agent-configs/clients/nonexistent/agent-configs",
    });

    expect(res.statusCode).toBe(404);
  });
});

// ── Config resolution cascade ───────────────────────────────────────────────

describe("GET /api/v1/agent-configs/resolve/:agentType — client override cascade", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns client-specific config when x-client-id header is present and client config exists", async () => {
    // First query: client-specific lookup → found
    const clientSpecificChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockClientConfig]),
    };
    (db.select as any).mockReturnValueOnce(clientSpecificChain);

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/agent-configs/resolve/article_writer",
      headers: { "x-client-id": "client-1" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.clientId).toBe("client-1");
  });

  it("falls back to global config when no client-specific config exists", async () => {
    // First query: client-specific → not found
    const emptyChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    // Second query: global → found
    const globalChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockConfig]),
    };
    (db.select as any)
      .mockReturnValueOnce(emptyChain)
      .mockReturnValueOnce(globalChain);

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/agent-configs/resolve/article_writer",
      headers: { "x-client-id": "client-1" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.clientId).toBeNull();
  });

  it("returns global config when no x-client-id header provided", async () => {
    const globalChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockConfig]),
    };
    (db.select as any).mockReturnValueOnce(globalChain);

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/agent-configs/resolve/article_writer",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.clientId).toBeNull();
  });

  it("returns 404 when no config exists at all", async () => {
    const emptyChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    (db.select as any)
      .mockReturnValueOnce(emptyChain)
      .mockReturnValueOnce(emptyChain);

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/agent-configs/resolve/article_writer",
      headers: { "x-client-id": "client-1" },
    });

    expect(res.statusCode).toBe(404);
  });
});
