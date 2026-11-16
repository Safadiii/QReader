import { backend, isUuid, staffStore, SIGN_IN, type BackendOrder, type BackendQr } from "@/lib/backend";
import { publicBaseUrl } from "@/lib/public-url";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The QR link for one of the signed-in store's orders, so staff can show it as a slip. */
export async function GET(request: Request, ctx: RouteContext<"/api/kitchen/orders/[id]/qr">) {
  const store = await staffStore(request);
  if (!store) return json(SIGN_IN, 401);
  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: "Invalid request." }, 422);
  try {
    // Only this store's orders: the backend looks the QR up by order id alone.
    const ordersRes = await backend(`/orders/?store_id=${store}`);
    if (!ordersRes.ok) return json({ error: `Orders request failed (${ordersRes.status}).` }, 502);
    const orders = (await ordersRes.json()) as BackendOrder[];
    if (!orders.some((o) => o.id === id)) return json({ error: "Order not found." }, 404);

    let qrRes = await backend(`/orders/${id}/qr`);
    if (qrRes.status === 404) qrRes = await backend(`/orders/${id}/qr`, { method: "POST" });
    if (!qrRes.ok) return json({ error: `Could not load the QR (${qrRes.status}).` }, 502);
    const qr = (await qrRes.json()) as BackendQr;
    if (!qr.is_active) return json({ error: "This QR has expired." }, 410);

    const token = decodeURIComponent(qr.tracking_url.split("/").pop() ?? "");
    const base = publicBaseUrl(request);
    return json({ trackingUrl: base ? `${base}/track/${encodeURIComponent(token)}` : qr.tracking_url });
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
