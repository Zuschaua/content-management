import type { APIRequestContext } from "@playwright/test";

export const API = process.env.API_URL ?? "http://localhost:3001";

export interface AuthSession {
  cookie: string;
  userId: string;
  role: string;
}

let _adminCounter = 0;

/** Register a fresh admin user and return a session cookie. */
export async function registerAdmin(
  request: APIRequestContext,
  suffix?: string
): Promise<AuthSession> {
  const tag = suffix ?? `${Date.now()}-${++_adminCounter}`;
  const email = `admin-${tag}@e2e.test`;

  const res = await request.post(`${API}/api/v1/auth/register`, {
    data: { email, password: "E2ePassword123!", name: `Admin ${tag}` },
  });

  if (!res.ok()) {
    throw new Error(`Register failed: ${res.status()} ${await res.text()}`);
  }

  const body = await res.json();
  const setCookie = res.headers()["set-cookie"] ?? "";
  const cookie = setCookie.split(";")[0]; // "cf_session=<value>"

  return { cookie, userId: body.user.id, role: body.user.role };
}

/** Login an existing user. */
export async function login(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<AuthSession> {
  const res = await request.post(`${API}/api/v1/auth/login`, {
    data: { email, password },
  });

  if (!res.ok()) {
    throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
  }

  const body = await res.json();
  const setCookie = res.headers()["set-cookie"] ?? "";
  const cookie = setCookie.split(";")[0];

  return { cookie, userId: body.user.id, role: body.user.role };
}

/** Make an authenticated GET request. */
export async function authGet(
  request: APIRequestContext,
  path: string,
  session: AuthSession
) {
  return request.get(`${API}${path}`, {
    headers: { Cookie: session.cookie },
  });
}

/** Make an authenticated POST request. */
export async function authPost(
  request: APIRequestContext,
  path: string,
  session: AuthSession,
  data: unknown
) {
  return request.post(`${API}${path}`, {
    headers: { Cookie: session.cookie },
    data,
  });
}

/** Make an authenticated PATCH request. */
export async function authPatch(
  request: APIRequestContext,
  path: string,
  session: AuthSession,
  data: unknown
) {
  return request.patch(`${API}${path}`, {
    headers: { Cookie: session.cookie },
    data,
  });
}

/** Make an authenticated DELETE request. */
export async function authDelete(
  request: APIRequestContext,
  path: string,
  session: AuthSession
) {
  return request.delete(`${API}${path}`, {
    headers: { Cookie: session.cookie },
  });
}

/** Create a client via the API and return its id. */
export async function createClient(
  request: APIRequestContext,
  session: AuthSession,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const res = await authPost(request, "/api/v1/clients", session, {
    name: `Test Client ${Date.now()}`,
    websiteUrl: "https://test.example.com",
    niche: "SaaS",
    industry: "Technology",
    ...overrides,
  });

  if (!res.ok()) {
    throw new Error(`Create client failed: ${res.status()} ${await res.text()}`);
  }

  const body = await res.json();
  return body.client.id;
}
