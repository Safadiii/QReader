import { backend } from "@/lib/backend";
import { readPosterToken } from "@/lib/poster";
import { clientKey, limiter } from "@/lib/ratelimit";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
// A real customer orders once in a while; a script floods.
const tooMany = limiter(6, 10 * 60_000);

/** A customer sends their order from the public menu. The café is found by the menu link's signed token. */
export async function POST(request: Request, ctx: RouteContext<"/api/menu/[token]/order">) {
  const { token } = await ctx.params;
  const storeId = readPosterToken(token);
  if (!storeId) return Response.json({ detail: "This menu link isn't valid." }, { status: 404, headers });
  if (tooMany(`${clientKey(request)}:${storeId}`)) {
    return Response.json({ detail: "Too many orders. Please ask at the counter." }, { status: 429, headers });
  }
  const b = await request.json().catch(() => null);
  if (!b || !Array.isArray(b.lines)) return Response.json({ detail: "Invalid request." }, { status: 422, headers });
  try {
    const res = await backend(`/stores/${storeId}/menu/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: String(b.mode ?? ""),
        car_plate: b.car_plate == null ? null : String(b.car_plate).slice(0, 20),
        car_note: b.car_note == null ? null : String(b.car_note).slice(0, 60),
        car_color: b.car_color == null ? null : String(b.car_color).slice(0, 20),
        car_model: b.car_model == null ? null : String(b.car_model).slice(0, 40),
        table_label: b.table_label == null ? null : String(b.table_label).slice(0, 20),
        customer_name: String(b.customer_name ?? "").slice(0, 40),
        note: String(b.note ?? "").slice(0, 200),
        lines: b.lines.slice(0, 40).map((l: Record<string, unknown>) => ({
          item_id: String(l.item_id ?? ""),
          qty: Math.max(1, Math.min(20, Math.round(Number(l.qty) || 1))),
        })),
      }),
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status, headers });
  } catch {
    return Response.json({ detail: "Can't reach the café right now." }, { status: 502, headers });
  }
}
