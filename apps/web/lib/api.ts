const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "editor" | "writer";
};

export type Client = {
  id: string;
  name: string;
  websiteUrl: string;
  niche?: string | null;
  industry?: string | null;
  contactInfo?: { email?: string; phone?: string; notes?: string } | null;
  notes?: string | null;
  active: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateClientInput = {
  name: string;
  websiteUrl: string;
  niche?: string;
  industry?: string;
  contactInfo?: { email?: string; phone?: string; notes?: string };
  notes?: string;
};

export function getActiveClientId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("activeClientId");
}

export function setActiveClientId(clientId: string | null): void {
  if (typeof window === "undefined") return;
  if (clientId) {
    localStorage.setItem("activeClientId", clientId);
  } else {
    localStorage.removeItem("activeClientId");
  }
}

function clientHeaders(): Record<string, string> {
  const clientId = getActiveClientId();
  return clientId ? { "X-Client-Id": clientId } : {};
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...clientHeaders(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { status: res.status, body };
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getMe(): Promise<{ user: User } | null> {
  try {
    return await apiFetch<{ user: User }>("/api/v1/auth/me");
  } catch {
    return null;
  }
}

export async function login(
  email: string,
  password: string
): Promise<{ user: User }> {
  return apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<{ user: User }> {
  return apiFetch("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", { method: "POST" });
}

export async function listUsers(): Promise<{ users: User[] }> {
  return apiFetch("/api/v1/users");
}

export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role: User["role"];
}): Promise<{ user: User }> {
  return apiFetch("/api/v1/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  id: string,
  data: Partial<{ name: string; role: User["role"]; password: string }>
): Promise<{ user: User }> {
  return apiFetch(`/api/v1/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string): Promise<void> {
  await apiFetch(`/api/v1/users/${id}`, { method: "DELETE" });
}

// --- Client API ---

export async function listClients(): Promise<{ clients: Client[] }> {
  return apiFetch("/api/v1/clients");
}

export async function getClient(id: string): Promise<{ client: Client }> {
  return apiFetch(`/api/v1/clients/${id}`);
}

export async function createClient(
  data: CreateClientInput
): Promise<{ client: Client }> {
  return apiFetch("/api/v1/clients", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateClient(
  id: string,
  data: Partial<CreateClientInput>
): Promise<{ client: Client }> {
  return apiFetch(`/api/v1/clients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function archiveClient(id: string): Promise<void> {
  await apiFetch(`/api/v1/clients/${id}`, { method: "DELETE" });
}
