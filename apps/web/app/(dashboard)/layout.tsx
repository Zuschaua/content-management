import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ClientSelector } from "../../components/client-selector";

const API_BASE = process.env.API_URL ?? "http://localhost:3001";

async function getSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");
  if (!sessionCookie) return null;

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { Cookie: `session=${sessionCookie.value}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <span className="font-bold text-gray-900">Content Factory</span>
        </div>
        <ClientSelector />
        <nav className="flex-1 px-2 py-4 space-y-1">
          <NavItem href="/dashboard" label="Dashboard" />
          <NavItem href="/clients" label="Clients" />
          <NavItem href="/pipeline" label="Pipeline" />
          <NavItem href="/calendar" label="Calendar" />
          {session.user?.role === "admin" && (
            <NavItem href="/settings/users" label="Users" />
          )}
          <NavItem href="/settings" label="Settings" />
        </nav>
        <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
          <p className="font-medium text-gray-700 truncate">{session.user?.name}</p>
          <p className="truncate">{session.user?.email}</p>
          <p className="uppercase tracking-wide mt-1">{session.user?.role}</p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">{children}</main>
    </div>
  );
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
    >
      {label}
    </a>
  );
}
