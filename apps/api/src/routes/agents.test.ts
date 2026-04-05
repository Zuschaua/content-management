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

// Mock authenticate plugin
vi.mock("../plugins/authenticate.js", () => ({
  requireAuth: vi.fn(async () => {}),
}));

// Mock BullMQ
const mockQueueAdd = vi.fn().mockResolvedValue({});
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
  })),
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../lib/crypto.js", () => ({
  signJobPayload: vi.fn().mockReturnValue("test-signature"),
  verifyJobSignature: vi.fn().mockReturnValue(true),
}));

import Fastify from "fastify";
import { agentRoutes } from "./agents.js";
import { db } from "../db/index.js";

const testUser = { userId: "user-1", role: "admin" as const, name: "Admin", email: "admin@test.com" };

function buildApp(user = testUser) {
  const app = Fastify({ logger: false });
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    req.user = user;
  });
  app.register(agentRoutes, { prefix: "/api/v1/clients" });
  return app;
}

const clientId = "11111111-1111-1111-1111-111111111111";
const articleId = "22222222-2222-2222-2222-222222222222";
const sectionId = "33333333-3333-3333-3333-333333333333";
const agentJobId = "44444444-4444-4444-4444-444444444444";

function mockSelectChain(rows: any[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
}

function mockInsertChain(rows: any[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

// ── write-article route ─────────────────────────────────────────────────────

describe("POST /:clientId/agents/write-article", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues job for approved article (202)", async () => {
    // 1st select: client lookup
    // 2nd select: article lookup
    // 3rd select: concurrent job check
    (db.select as any)
      .mockReturnValueOnce(mockSelectChain([{ id: clientId, active: true }]))
      .mockReturnValueOnce(
        mockSelectChain([
          { id: articleId, status: "approved", outline: { sections: ["Intro", "Body", "Conclusion"] } },
        ])
      )
      .mockReturnValueOnce(mockSelectChain([])); // no concurrent jobs

    (db.insert as any).mockReturnValueOnce(mockInsertChain([{ id: agentJobId }]));

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/agents/write-article`,
      payload: { articleId },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.agentJobId).toBe(agentJobId);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "write-article",
      expect.objectContaining({ agentJobId, clientId, articleId }),
      expect.objectContaining({ attempts: 2 })
    );
  });

  it("rejects non-approved article (422)", async () => {
    (db.select as any)
      .mockReturnValueOnce(mockSelectChain([{ id: clientId, active: true }]))
      .mockReturnValueOnce(
        mockSelectChain([
          { id: articleId, status: "suggested", outline: { sections: ["Intro"] } },
        ])
      );

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/agents/write-article`,
      payload: { articleId },
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("suggested");
  });

  it("rejects article from wrong client (404)", async () => {
    (db.select as any)
      .mockReturnValueOnce(mockSelectChain([{ id: clientId, active: true }]))
      .mockReturnValueOnce(mockSelectChain([])); // article not found for this client

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/agents/write-article`,
      payload: { articleId },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe("Article not found");
  });

  it("rejects concurrent write (409)", async () => {
    (db.select as any)
      .mockReturnValueOnce(mockSelectChain([{ id: clientId, active: true }]))
      .mockReturnValueOnce(
        mockSelectChain([
          { id: articleId, status: "approved", outline: { sections: ["Intro"] } },
        ])
      )
      .mockReturnValueOnce(mockSelectChain([{ id: "existing-job-id" }])); // concurrent job exists

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/agents/write-article`,
      payload: { articleId },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toContain("already running");
  });

  it("allows retry on writing status (202)", async () => {
    (db.select as any)
      .mockReturnValueOnce(mockSelectChain([{ id: clientId, active: true }]))
      .mockReturnValueOnce(
        mockSelectChain([
          { id: articleId, status: "writing", outline: { sections: ["Intro", "Body"] } },
        ])
      )
      .mockReturnValueOnce(mockSelectChain([])); // no concurrent jobs

    (db.insert as any).mockReturnValueOnce(mockInsertChain([{ id: agentJobId }]));

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/agents/write-article`,
      payload: { articleId },
    });

    expect(res.statusCode).toBe(202);
  });
});

// ── rewrite-section route ───────────────────────────────────────────────────

describe("POST /:clientId/agents/rewrite-section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues job for valid section (202)", async () => {
    (db.select as any)
      .mockReturnValueOnce(mockSelectChain([{ id: clientId, active: true }]))
      .mockReturnValueOnce(mockSelectChain([{ id: articleId, status: "written" }]))
      .mockReturnValueOnce(mockSelectChain([{ id: sectionId }]))
      .mockReturnValueOnce(mockSelectChain([])); // no concurrent jobs

    (db.insert as any).mockReturnValueOnce(mockInsertChain([{ id: agentJobId }]));

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/agents/rewrite-section`,
      payload: { articleId, sectionId, instructions: "Make it more engaging" },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.agentJobId).toBe(agentJobId);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "rewrite-section",
      expect.objectContaining({ agentJobId, clientId, articleId, sectionId, instructions: "Make it more engaging" }),
      expect.any(Object)
    );
  });

  it("rejects section from wrong article (404)", async () => {
    (db.select as any)
      .mockReturnValueOnce(mockSelectChain([{ id: clientId, active: true }]))
      .mockReturnValueOnce(mockSelectChain([{ id: articleId, status: "written" }]))
      .mockReturnValueOnce(mockSelectChain([])); // section not found

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/agents/rewrite-section`,
      payload: { articleId, sectionId },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toContain("Section not found");
  });

  it("rejects rewrite on suggested article (422)", async () => {
    (db.select as any)
      .mockReturnValueOnce(mockSelectChain([{ id: clientId, active: true }]))
      .mockReturnValueOnce(mockSelectChain([{ id: articleId, status: "suggested" }]));

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/agents/rewrite-section`,
      payload: { articleId, sectionId },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toContain("suggested");
  });

  it("rejects concurrent rewrite job (409)", async () => {
    (db.select as any)
      .mockReturnValueOnce(mockSelectChain([{ id: clientId, active: true }]))
      .mockReturnValueOnce(mockSelectChain([{ id: articleId, status: "written" }]))
      .mockReturnValueOnce(mockSelectChain([{ id: sectionId }]))
      .mockReturnValueOnce(mockSelectChain([{ id: "existing-rewrite-job" }]));

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/agents/rewrite-section`,
      payload: { articleId, sectionId },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toContain("already running");
  });
});
