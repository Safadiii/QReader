import { backend } from "@/lib/backend";
import { createSession, sessionCookie } from "@/lib/session";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

// New accounts per client address. In memory: fine for one server, and the real fix
// for abuse is the WhatsApp code that will verify each phone number.
const recent = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function tooMany(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > MAX_PER_WINDOW;
}

/** Sign-up: { storeName, name, phone, password, timezone }. Creates the store and its owner, then signs them in. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const storeName = String(body?.storeName ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const phone = String(body?.phone ?? "");
  const password = String(body?.password ?? "");
  if (!storeName || !name || !phone) return json({ error: "Fill in every field." }, 422);
  if (password.length < 10) return json({ error: "Use a password of at least 10 characters." }, 422);
  if (tooMany(request)) return json({ error: "Too many sign-ups from here. Try again later." }, 429);

  let res: Response;
  try {
    res = await backend("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_name: storeName,
        name,
        phone,
        password,
        timezone: typeof body?.timezone === "string" ? body.timezone : undefined,
      }),
    });
  } catch {
    return json({ error: "Can't reach the server. Try again." }, 502);
  }
  if (res.status === 409) return json({ error: "That phone number already has an account. Sign in instead." }, 409);
  if (res.status === 422) return json({ error: "Check the phone number and the other fields." }, 422);
  if (!res.ok) return json({ error: "Sign-up is unavailable right now." }, 502);

  const staff = await res.json();
  const value = await createSession({
    userId: staff.id,
    storeId: staff.store_id,
    name: staff.name,
    role: staff.role,
  });
  if (!value) {
    return json({ error: "The server is missing SESSION_SECRET (32+ characters) in web/.env.local." }, 500);
  }
  return json({ name: staff.name, store: staff.store_name }, 201, { "Set-Cookie": sessionCookie(value, request) });
}
