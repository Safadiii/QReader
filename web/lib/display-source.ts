import { reloadTo } from "@/lib/navigate";
/**
 * Where the customer-facing screen gets its data: this app's /api/display
 * route, which asks the backend for the store's newest order and its QR.
 */

export type DisplayOrder = {
  id: string;
  orderNumber: number;
  /** Unguessable token from `qr_codes.token`. Never the order id or number. */
  token: string;
  /** What the QR encodes: the customer's tracking page for this order. */
  trackingUrl: string;
  /** True once a customer has opened the tracking page. */
  scanned: boolean;
};

/** The order to show now, or null when there is nothing to scan. Throws if offline. */
export async function fetchCurrentOrder(): Promise<DisplayOrder | null> {
  const res = await fetch("/api/display", { cache: "no-store" });
  if (res.status === 401) reloadTo("/login?next=/display");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Display request failed (${res.status})`);
  return body.order ?? null;
}

/** Reports a scan the way a customer's phone would (demo button). */
export async function simulateScan(token: string) {
  await fetch(`/api/track/${encodeURIComponent(token)}/scan`, { method: "POST" });
}
