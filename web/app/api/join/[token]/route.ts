import { backend, type BackendOrder, type BackendQr } from "@/lib/backend";
import { readPosterToken } from "@/lib/poster";
import { clientKey, limiter } from "@/lib/ratelimit";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

// Order numbers are short, so slow down anyone trying them one after another.
const tooMany = limiter(12, 60_000);

const ACTIVE = new Set(["pending", "preparing", "ready"]);

/** A customer typed their order number: find the order and send them to its tracking page. */
export async function POST(request: Request, ctx: RouteContext<"/api/join/[token]">) {
  const { token } = await ctx.params;
  const storeId = readPosterToken(token);
  if (!storeId) return json({ error: "invalid" }, 404);
  if (tooMany(`${clientKey(request)}:${storeId}`)) return json({ error: "slow" }, 429);

  const body = await request.json().catch(() => null);
  const number = Number(body?.orderNumber);
  if (!Number.isInteger(number) || number <= 0 || number > 99999) return json({ error: "number" }, 422);

  try {
    const ordersRes = await backend(`/orders/?store_id=${storeId}`);
    if (!ordersRes.ok) return json({ error: "unavailable" }, 502);
    const orders = (await ordersRes.json()) as BackendOrder[];
    const order = orders
      .filter((o) => o.order_number === number && ACTIVE.has(o.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!order) return json({ error: "not_found" }, 404);

    let qrRes = await backend(`/orders/${order.id}/qr`);
    if (qrRes.status === 404) qrRes = await backend(`/orders/${order.id}/qr`, { method: "POST" });
    if (!qrRes.ok) return json({ error: "unavailable" }, 502);
    const qr = (await qrRes.json()) as BackendQr;
    if (!qr.is_active) return json({ error: "not_found" }, 404);

    const trackToken = decodeURIComponent(qr.tracking_url.split("/").pop() ?? "");
    return json({ path: `/track/${encodeURIComponent(trackToken)}` });
  } catch {
    return json({ error: "unavailable" }, 502);
  }
}
