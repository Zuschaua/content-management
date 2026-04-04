import { redirect } from "next/navigation";
import { cookies } from "next/headers";

const API_BASE = process.env.API_URL ?? "http://localhost:3001";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");

  if (sessionCookie) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { Cookie: `session=${sessionCookie.value}` },
        cache: "no-store",
      });
      if (res.ok) {
        redirect("/dashboard");
      }
    } catch {
      // fall through to login
    }
  }

  redirect("/login");
}
