import "server-only";
import { sessionFrom } from "@/lib/session";
import { atLeast, isRole, type Role } from "@/lib/roles";

/**
 * Server-side access to the FastAPI backend. The browser only ever talks to
 * this Next app's own /api routes, so the backend's staff endpoints (orders,
 * QR management) are never exposed to customers and no CORS setup is needed.
 */
const API_URL = (process.env.QREADER_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

export function backend(path: string, init?: RequestInit) {
  return fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    // The shared secret that proves this request comes from our web server.
    headers: { ...init?.headers, "X-API-Key": process.env.QREADER_API_KEY ?? "" },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
}

export type BackendOrder = {
  id: string;
  order_number: number;
  status: "pending" | "preparing" | "ready" | "collected" | "cancelled";
  order_date: string;
  created_at: string;
  ready_at: string | null;
  completed_at: string | null;
  customer_coming_at: string | null;
  scanned_at: string | null;
  ring_requested_at: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

export const SIGN_IN = { error: "Sign in to continue." };

export const FORBIDDEN = { error: "Your role cannot do this." };

export type Member = { userId: string; storeId: string; role: Role };

/** Who is signed in, asked of the backend every few seconds, so removing someone
 * or changing their role takes effect almost at once. */
const CHECK_MS = 10_000;
const checked = new Map<string, { at: number; role: Role | null }>();

export async function staffSession(request: Request): Promise<Member | null> {
  const session = await sessionFrom(request);
  if (!session || !isUuid(session.storeId) || !isUuid(session.userId) || !isRole(session.role)) return null;
  const who = { userId: session.userId, storeId: session.storeId };

  const hit = checked.get(session.userId);
  if (hit && Date.now() - hit.at < CHECK_MS) return hit.role ? { ...who, role: hit.role } : null;

  try {
    const res = await backend(`/auth/members/${session.userId}`);
    if (res.status === 404) {
      checked.set(session.userId, { at: Date.now(), role: null });
      return null;
    }
    if (!res.ok) return { ...who, role: session.role };
    const member = await res.json();
    if (member.store_id !== session.storeId || !isRole(member.role)) return null;
    checked.set(session.userId, { at: Date.now(), role: member.role });
    return { ...who, role: member.role };
  } catch {
    // Backend unreachable: every other call fails too, so fall back to the cookie.
    return { ...who, role: session.role };
  }
}

/** The store of the signed-in member, or null if nobody is signed in. */
export async function staffStore(request: Request): Promise<string | null> {
  return (await staffSession(request))?.storeId ?? null;
}

/** The signed-in member if they are at least `min`; otherwise the response to send back. */
export async function staffAtLeast(
  request: Request,
  min: Role,
): Promise<{ member: Member } | { denied: Response }> {
  const member = await staffSession(request);
  const headers = { "Cache-Control": "no-store" };
  if (!member) return { denied: Response.json(SIGN_IN, { status: 401, headers }) };
  if (!atLeast(member.role, min)) return { denied: Response.json(FORBIDDEN, { status: 403, headers }) };
  return { member };
}

export type BackendQr = {
  order_id: string;
  tracking_url: string;
  is_active: boolean;
  scanned_at: string | null;
};

/** Forwards a customer's request for a QR token to the backend, as is. */
export async function proxyTrack(token: string, action: "" | "/scan" | "/coming" = "") {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try {
    const res = await backend(`/track/${encodeURIComponent(token)}${action}`, {
      method: action ? "POST" : "GET",
    });
    const body = await res.json().catch(() => ({}));
    return Response.json(body, { status: res.status, headers });
  } catch {
    return Response.json({ detail: "Backend unreachable." }, { status: 502, headers });
  }
}
