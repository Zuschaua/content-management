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

// Mock the authenticate plugin
vi.mock("../plugins/authenticate.js", () => ({
  requireAuth: vi.fn(async () => {}),
  requireRole: vi.fn(() => async () => {}),
}));

import Fastify from "fastify";
import { clientRoutes } from "./clients.js";
import { db } from "../db/index.js";

function buildApp() {
  const app = Fastify({ logger: false });

  // Decorate request.user as an admin for tests
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    req.user = { userId: "user-1", role: "admin", name: "Test Admin", email: "admin@test.com" };
  });

  app.register(clientRoutes, { prefix: "/api/v1/clients" });
  return app;
}

const mockClient = {
  id: "client-1",
  name: "Acme Corp",
  websiteUrl: "https://acme.com",
  niche: "SaaS",
  industry: "Technology",
  contactInfo: null,
  notes: null,
  active: true,
  createdBy: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/v1/clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns list of clients", async () => {
    const chainMock = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([mockClient]) };
    (db.select as any).mockReturnValue(chainMock);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/clients" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].name).toBe("Acme Corp");
  });
});

describe("POST /api/v1/clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new client and returns 201", async () => {
    const chainMock = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([mockClient]) };
    (db.insert as any).mockReturnValue(chainMock);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      payload: { name: "Acme Corp", websiteUrl: "https://acme.com", niche: "SaaS", industry: "Technology" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.client.name).toBe("Acme Corp");
  });

  it("rejects invalid input with 400", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      payload: { name: "", websiteUrl: "not-a-url" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/v1/clients/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns client by id", async () => {
    const chainMock = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([mockClient]) };
    (db.select as any).mockReturnValue(chainMock);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/clients/client-1" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.client.id).toBe("client-1");
  });

  it("returns 404 when client not found", async () => {
    const chainMock = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) };
    (db.select as any).mockReturnValue(chainMock);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/clients/nonexistent" });

    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /api/v1/clients/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates client and returns updated data", async () => {
    const updated = { ...mockClient, name: "Acme Updated" };
    const chainMock = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([updated]) };
    (db.update as any).mockReturnValue(chainMock);

    const app = buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/clients/client-1",
      payload: { name: "Acme Updated" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.client.name).toBe("Acme Updated");
  });

  it("returns 404 when client not found", async () => {
    const chainMock = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([]) };
    (db.update as any).mockReturnValue(chainMock);

    const app = buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/clients/nonexistent",
      payload: { name: "Nope" },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/v1/clients/:id (archive)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives client and returns 204", async () => {
    const chainMock = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([{ id: "client-1" }]) };
    (db.update as any).mockReturnValue(chainMock);

    const app = buildApp();
    const res = await app.inject({ method: "DELETE", url: "/api/v1/clients/client-1" });

    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when client not found", async () => {
    const chainMock = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([]) };
    (db.update as any).mockReturnValue(chainMock);

    const app = buildApp();
    const res = await app.inject({ method: "DELETE", url: "/api/v1/clients/nonexistent" });

    expect(res.statusCode).toBe(404);
  });
});
