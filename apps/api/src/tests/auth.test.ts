import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db to avoid DATABASE_URL requirement in unit tests
vi.mock("../db/index.js", () => ({
  db: {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  },
}));

describe("generateSessionId", () => {
  it("returns a 64-character hex string", async () => {
    const { generateSessionId } = await import("../lib/auth.js");
    const id = generateSessionId();
    expect(id).toHaveLength(64);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("returns unique ids", async () => {
    const { generateSessionId } = await import("../lib/auth.js");
    const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()));
    expect(ids.size).toBe(100);
  });
});

describe("requireRole", () => {
  it("allows matching role", async () => {
    const { requireRole } = await import("../plugins/authenticate.js");
    const handler = requireRole("admin");
    const request = {
      user: { role: "admin", userId: "1", name: "A", email: "a@b.com" },
    };
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

    await handler(request as any, reply as any);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it("rejects non-matching role", async () => {
    const { requireRole } = await import("../plugins/authenticate.js");
    const handler = requireRole("admin");
    const request = {
      user: { role: "editor", userId: "1", name: "A", email: "a@b.com" },
    };
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

    await handler(request as any, reply as any);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it("rejects unauthenticated request", async () => {
    const { requireRole } = await import("../plugins/authenticate.js");
    const handler = requireRole("admin");
    const request = { user: null };
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

    await handler(request as any, reply as any);
    expect(reply.status).toHaveBeenCalledWith(401);
  });
});

describe("requireAuth", () => {
  it("passes when user is set", async () => {
    const { requireAuth } = await import("../plugins/authenticate.js");
    const request = {
      user: { role: "editor", userId: "1", name: "A", email: "a@b.com" },
    };
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

    await requireAuth(request as any, reply as any);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it("returns 401 when user is null", async () => {
    const { requireAuth } = await import("../plugins/authenticate.js");
    const request = { user: null };
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };

    await requireAuth(request as any, reply as any);
    expect(reply.status).toHaveBeenCalledWith(401);
  });
});
