import "server-only";
import { backend, type BackendOrder, type BackendQr } from "@/lib/backend";
import { publicBaseUrl } from "@/lib/public-url";

const SHOWABLE = new Set(["pending", "preparing", "ready"]);

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The order the till (iPad) screen should show right now: the store's newest one, with its QR. */
export async function loadDisplay(storeId: string, request: Request) {
  try {
    const ordersRes = await backend(`/orders/?store_id=${storeId}`);
    if (!ordersRes.ok) return json({ error: `Orders request failed (${ordersRes.status}).` }, 502);
    const orders = (await ordersRes.json()) as BackendOrder[];
    const order = orders[0];
    if (!order || !SHOWABLE.has(order.status)) return json({ order: null });

    // Reuse the order's QR; issue one the first time the order is shown.
    let qrRes = await backend(`/orders/${order.id}/qr`);
    if (qrRes.status === 404) qrRes = await backend(`/orders/${order.id}/qr`, { method: "POST" });
    if (!qrRes.ok) return json({ order: null });
    const qr = (await qrRes.json()) as BackendQr;
    // Expired or revoked: staff must rotate it, so there is nothing to scan.
    if (!qr.is_active) return json({ order: null });

    const token = decodeURIComponent(qr.tracking_url.split("/").pop() ?? "");
    const base = publicBaseUrl(request);
    const trackingUrl = base ? `${base}/track/${encodeURIComponent(token)}` : qr.tracking_url;
    return json({
      order: {
        id: order.id,
        orderNumber: order.order_number,
        token,
        trackingUrl,
        scanned: qr.scanned_at !== null,
      },
    });
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}

/** What the waiting-room TV shows. */
export async function loadWaiting(storeId: string) {
  try {
    const res = await backend(`/orders/?store_id=${storeId}`);
    if (!res.ok) return json({ error: `Orders request failed (${res.status}).` }, 502);
    const orders = (await res.json()) as BackendOrder[];
    const pick = (status: string) =>
      orders
        .filter((o) => o.status === status)
        .sort((a, b) => (a.ready_at ?? a.created_at).localeCompare(b.ready_at ?? b.created_at))
        .map((o) => ({ id: o.id, number: o.order_number, ring: o.ring_requested_at }));
    return json({ ready: pick("ready"), preparing: [...pick("pending"), ...pick("preparing")] });
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}

export type ScreenTarget = { store_id: string; store_name: string; kind: "display" | "waiting" };

/** Which store and screen a link token belongs to, or null if unknown or replaced. */
export async function resolveScreen(token: string): Promise<ScreenTarget | null> {
  if (!/^[\w-]{8,64}$/.test(token)) return null;
  try {
    const res = await backend(`/screens/${encodeURIComponent(token)}`);
    return res.ok ? ((await res.json()) as ScreenTarget) : null;
  } catch {
    return null;
  }
}
