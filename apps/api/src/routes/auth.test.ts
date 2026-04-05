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

// Mock argon2 to avoid native module issues in test environment
vi.mock("argon2", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$argon2id$hashed"),
    verify: vi.fn().mockResolvedValue(true),
  },
}));

// Mock the auth lib
vi.mock("../lib/auth.js", () => ({
  createSession: vi.fn().mockResolvedValue("test-session-id-64chars0000000000000000000000000000000000000000"),
  invalidateSession: vi.fn().mockResolvedValue(undefined),
  validateSession: vi.fn().mockResolvedValue(null),
  generateSessionId: vi.fn().mockReturnValue("test-session-id-64chars0000000000000000000000000000000000000000"),
  SESSION_COOKIE: "app_session",
  SESSION_DURATION_MS: 604800000,
}));

// Mock authenticate plugin
vi.mock("../plugins/authenticate.js", () => ({
  default: async (app: any) => {
    app.decorateRequest("user", null);
  },
  requireAuth: vi.fn(async (request: any, reply: any) => {
    if (!request.user) return reply.status(401).send({ error: "Unauthorized" });
  }),
  requireRole: vi.fn(() => async () => {}),
}));

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { authRoutes } from "./auth.js";
import { db } from "../db/index.js";

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: "admin" as const,
  passwordHash: "$argon2id$hashed",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.decorateRequest("user", null);
  app.register(authRoutes, { prefix: "/api/v1/auth" });
  return app;
}

describe("POST /api/v1/auth/register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers a new user and returns 201 with user data", async () => {
    // No existing user
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([
        { id: mockUser.id, email: mockUser.email, name: mockUser.name, role: mockUser.role },
      ]),
    };
    (db.select as any).mockReturnValue(selectChain);
    (db.insert as any).mockReturnValue(insertChain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "test@example.com", password: "Password123!", name: "Test User" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe("test@example.com");
    expect(body.user).not.toHaveProperty("passwordHash");
  });

  it("returns 409 when email is already registered", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "existing-user" }]),
    };
    (db.select as any).mockReturnValue(selectChain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "test@example.com", password: "Password123!", name: "Test User" },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/already registered/i);
  });

  it("returns 400 when email is invalid", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "not-an-email", password: "Password123!", name: "Test User" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "test@example.com" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("sets session cookie on successful registration", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([
        { id: mockUser.id, email: mockUser.email, name: mockUser.name, role: mockUser.role },
      ]),
    };
    (db.select as any).mockReturnValue(selectChain);
    (db.insert as any).mockReturnValue(insertChain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "new@example.com", password: "Password123!", name: "New User" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.headers["set-cookie"]).toContain("app_session");
  });
});

describe("POST /api/v1/auth/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs in with valid credentials and returns user data", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockUser]),
    };
    (db.select as any).mockReturnValue(selectChain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "test@example.com", password: "Password123!" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe("test@example.com");
    expect(body.user).not.toHaveProperty("passwordHash");
  });

  it("returns 401 when user does not exist", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    (db.select as any).mockReturnValue(selectChain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "nobody@example.com", password: "Password123!" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when password is wrong", async () => {
    const { default: argon2 } = await import("argon2");
    (argon2.verify as any).mockResolvedValueOnce(false);

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockUser]),
    };
    (db.select as any).mockReturnValue(selectChain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "test@example.com", password: "WrongPassword!" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("sets session cookie on successful login", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockUser]),
    };
    (db.select as any).mockReturnValue(selectChain);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "test@example.com", password: "Password123!" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.headers["set-cookie"]).toContain("app_session");
  });

  it("returns 400 with invalid payload", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "not-an-email" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/v1/auth/logout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and clears session cookie when authenticated", async () => {
    const app = Fastify({ logger: false });
    await app.register(cookie);
    app.decorateRequest("user", null);
    app.addHook("onRequest", async (req) => {
      req.user = { userId: mockUser.id, role: "admin", name: mockUser.name, email: mockUser.email };
    });
    app.register(authRoutes, { prefix: "/api/v1/auth" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies: { app_session: "test-session-id-64chars0000000000000000000000000000000000000000" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    const { requireAuth } = await import("../plugins/authenticate.js");
    (requireAuth as any).mockImplementationOnce(async (_req: any, reply: any) => {
      return reply.status(401).send({ error: "Unauthorized" });
    });

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/v1/auth/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns authenticated user profile", async () => {
    const app = Fastify({ logger: false });
    await app.register(cookie);
    app.decorateRequest("user", null);
    app.addHook("onRequest", async (req) => {
      req.user = { userId: mockUser.id, role: "admin", name: mockUser.name, email: mockUser.email };
    });
    app.register(authRoutes, { prefix: "/api/v1/auth" });

    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.userId).toBe("user-1");
    expect(body.user.role).toBe("admin");
  });

  it("returns 401 when not authenticated", async () => {
    const { requireAuth } = await import("../plugins/authenticate.js");
    (requireAuth as any).mockImplementationOnce(async (_req: any, reply: any) => {
      return reply.status(401).send({ error: "Unauthorized" });
    });

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });

    expect(res.statusCode).toBe(401);
  });
});
