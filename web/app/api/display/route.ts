import { backend, type BackendOrder, type BackendQr } from "@/lib/backend";
import { publicBaseUrl } from "@/lib/public-url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOWABLE = new Set(["pending", "preparing", "ready"]);

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The order the till screen should show right now: the store's newest one. */
export async function GET(request: Request) {
  const storeId =
    new URL(request.url).searchParams.get("storeId") ?? process.env.QREADER_STORE_ID ?? "";
  if (!UUID.test(storeId)) {
    return json({ error: "Set QREADER_STORE_ID in web/.env.local (or pass ?storeId=)." }, 400);
  }

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
