import { backend } from "@/lib/backend";
import { createSession, sessionCookie } from "@/lib/session";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Staff sign-in: { email, password }. Sets the session cookie. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "");
  const password = String(body?.password ?? "");
  if (!email || !password) return json({ error: "Enter your email and password." }, 422);

  let res: Response;
  try {
    res = await backend("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return json({ error: "Can't reach the server. Try again." }, 502);
  }
  if (res.status === 401 || res.status === 422) return json({ error: "Wrong email or password." }, 401);
  if (res.status === 429) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  if (!res.ok) return json({ error: "Sign-in is unavailable right now." }, 502);

  const staff = await res.json();
  const value = await createSession({
    userId: staff.id,
    storeId: staff.store_id,
    name: staff.name,
    role: staff.role,
  });
  if (!value) return json({ error: "SESSION_SECRET is not set on the web server." }, 500);
  return json({ name: staff.name, store: staff.store_name }, 200, { "Set-Cookie": sessionCookie(value, request) });
}
