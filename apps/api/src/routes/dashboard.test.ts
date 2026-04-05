import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

// Mock the authenticate plugin
vi.mock("../plugins/authenticate.js", () => ({
  requireAuth: vi.fn(async () => {}),
}));

import Fastify from "fastify";
import { dashboardRoutes } from "./dashboard.js";
import { db } from "../db/index.js";

function buildApp() {
  const app = Fastify({ logger: false });

  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    req.user = {
      userId: "user-1",
      role: "admin",
      name: "Test Admin",
      email: "admin@test.com",
    };
  });

  app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
  return app;
}

/**
 * Creates a thenable chain mock. Every method (from, where, groupBy, orderBy,
 * limit, leftJoin) returns the chain itself. Awaiting the chain at any point
 * resolves to `result`.
 */
function thenableChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "groupBy", "orderBy", "limit", "leftJoin"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}

describe("GET /api/v1/dashboard/stats", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupMocks(responses: unknown[][]) {
    const selectMock = db.select as ReturnType<typeof vi.fn>;
    let callIndex = 0;
    selectMock.mockImplementation(() => {
      const result = responses[callIndex] ?? [];
      callIndex++;
      return thenableChain(result);
    });
  }

  // Standard mock sequence for all-clients view (no clientId):
  // 1: pipeline counts, 2: active clients, 3: job status,
  // 4: recent jobs, 5: recent articles,
  // 6: client overviews, 7: KB counts
  function allClientsResponses(overrides: Partial<Record<number, unknown[]>> = {}) {
    return [
      overrides[0] ?? [], // pipeline
      overrides[1] ?? [{ count: 0 }], // active clients
      overrides[2] ?? [], // job status
      overrides[3] ?? [], // recent jobs
      overrides[4] ?? [], // recent articles
      overrides[5] ?? [], // client overviews
      overrides[6] ?? [], // KB counts
    ];
  }

  // Client-scoped view (with clientId) skips client overviews + KB:
  // 1: pipeline, 2: active clients, 3: job status,
  // 4: recent jobs, 5: recent articles
  function clientScopedResponses(overrides: Partial<Record<number, unknown[]>> = {}) {
    return [
      overrides[0] ?? [],
      overrides[1] ?? [{ count: 0 }],
      overrides[2] ?? [],
      overrides[3] ?? [],
      overrides[4] ?? [],
    ];
  }

  it("returns correct pipeline counts", async () => {
    setupMocks(
      allClientsResponses({
        0: [
          { status: "suggested", count: 5 },
          { status: "approved", count: 3 },
          { status: "writing", count: 2 },
          { status: "ready", count: 4 },
        ],
        1: [{ count: 3 }],
      })
    );

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pipeline.suggested).toBe(5);
    expect(body.pipeline.approved).toBe(3);
    expect(body.pipeline.writing).toBe(2);
    expect(body.pipeline.ready).toBe(4);
    expect(body.pipeline.total).toBe(14);
  });

  it("client scoping works via clientId query param", async () => {
    setupMocks(
      clientScopedResponses({
        0: [{ status: "suggested", count: 2 }],
        1: [{ count: 1 }],
      })
    );

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats?clientId=client-1",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pipeline.suggested).toBe(2);
    expect(body.pipeline.total).toBe(2);
    // No client overviews when scoped
    expect(body.clientOverviews).toEqual([]);
  });

  it("ready to export count matches pipeline ready", async () => {
    setupMocks(
      allClientsResponses({
        0: [{ status: "ready", count: 7 }],
        1: [{ count: 2 }],
      })
    );

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.readyToExport).toBe(7);
    expect(body.pipeline.ready).toBe(7);
  });

  it("job status aggregation", async () => {
    setupMocks(
      allClientsResponses({
        2: [
          { status: "running", count: 2 },
          { status: "queued", count: 3 },
          { status: "failed", count: 1 },
          { status: "completed", count: 8 },
        ],
      })
    );

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.jobStatus.running).toBe(2);
    expect(body.jobStatus.queued).toBe(3);
    expect(body.jobStatus.failed).toBe(1);
    expect(body.jobStatus.completedToday).toBe(8);
  });

  it("recent activity ordered by timestamp descending", async () => {
    const now = Date.now();

    setupMocks(
      allClientsResponses({
        1: [{ count: 1 }],
        3: [
          {
            id: "job-1",
            agentType: "suggestion_engine",
            status: "completed",
            clientId: "c1",
            completedAt: new Date(now - 60000),
            createdAt: new Date(now - 120000),
          },
          {
            id: "job-2",
            agentType: "article_writer",
            status: "failed",
            clientId: "c1",
            completedAt: null,
            createdAt: new Date(now - 30000),
          },
        ],
        // clientIds lookup happens via the same db.select chain
        // but it's call #5 (after the client name lookup for jobs)
      })
    );

    // The route also does a client name lookup (call #5) and recent articles (call #6).
    // Our setupMocks already provides empty arrays for those via the defaults.
    // But the route does an extra db.select for client names if recentJobs has items.
    // We need to account for that extra query.
    const selectMock = db.select as ReturnType<typeof vi.fn>;
    let callIndex = 0;
    const responses = [
      [], // pipeline
      [{ count: 1 }], // active clients
      [], // job status
      [
        {
          id: "job-1",
          agentType: "suggestion_engine",
          status: "completed",
          clientId: "c1",
          completedAt: new Date(now - 60000),
          createdAt: new Date(now - 120000),
        },
        {
          id: "job-2",
          agentType: "article_writer",
          status: "failed",
          clientId: "c1",
          completedAt: null,
          createdAt: new Date(now - 30000),
        },
      ],
      [{ id: "c1", name: "Test Client" }], // client names for jobs
      [
        {
          id: "art-1",
          title: "Test Article",
          clientId: "c1",
          createdAt: new Date(now - 10000),
        },
      ], // recent articles
      [], // client overviews
      [], // KB counts
    ];
    selectMock.mockReset();
    selectMock.mockImplementation(() => {
      const result = responses[callIndex] ?? [];
      callIndex++;
      return thenableChain(result);
    });

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.recentActivity.length).toBeGreaterThanOrEqual(1);
    // Should be sorted descending by timestamp
    for (let i = 1; i < body.recentActivity.length; i++) {
      expect(
        new Date(body.recentActivity[i - 1].timestamp).getTime()
      ).toBeGreaterThanOrEqual(
        new Date(body.recentActivity[i].timestamp).getTime()
      );
    }
  });

  it("client overviews include KB status", async () => {
    setupMocks(
      allClientsResponses({
        1: [{ count: 2 }],
        5: [
          {
            id: "c1",
            name: "With KB",
            articleCount: 5,
            readyCount: 2,
            inProgressCount: 1,
            lastActivityAt: new Date(),
          },
          {
            id: "c2",
            name: "Without KB",
            articleCount: 3,
            readyCount: 0,
            inProgressCount: 0,
            lastActivityAt: null,
          },
        ],
        6: [
          { clientId: "c1", count: 4 },
          { clientId: "c2", count: 1 },
        ],
      })
    );

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.clientOverviews).toHaveLength(2);
    expect(body.clientOverviews[0].kbComplete).toBe(true);
    expect(body.clientOverviews[1].kbComplete).toBe(false);
  });

  it("auth required — returns 401 without user", async () => {
    const { requireAuth } = await import("../plugins/authenticate.js");
    (requireAuth as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (
        _req: unknown,
        reply: { status: (n: number) => { send: (b: unknown) => void } }
      ) => {
        reply.status(401).send({ error: "Unauthorized" });
      }
    );

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats",
    });

    expect(res.statusCode).toBe(401);
  });

  it("empty state returns zeros and empty arrays", async () => {
    setupMocks(allClientsResponses());

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pipeline.total).toBe(0);
    expect(body.pipeline.suggested).toBe(0);
    expect(body.readyToExport).toBe(0);
    expect(body.activeClients).toBe(0);
    expect(body.recentActivity).toEqual([]);
    expect(body.jobStatus.running).toBe(0);
    expect(body.jobStatus.queued).toBe(0);
    expect(body.jobStatus.failed).toBe(0);
    expect(body.jobStatus.completedToday).toBe(0);
    expect(body.clientOverviews).toEqual([]);
  });
});
