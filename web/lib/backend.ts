import "server-only";
import { sessionFrom } from "@/lib/session";

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

/** The store of the signed-in staff member, or null if nobody is signed in. */
export async function staffStore(request: Request): Promise<string | null> {
  const session = await sessionFrom(request);
  return session && isUuid(session.storeId) ? session.storeId : null;
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
