import { backend } from "@/lib/backend";
import { readPosterToken } from "@/lib/poster";
import { clientKey, limiter } from "@/lib/ratelimit";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const tooMany = limiter(8, 10 * 60_000);

/** The car page sends an order: what the customer wants, their car, and an order number if they have one. */
export async function POST(request: Request, ctx: RouteContext<"/api/car/[token]/order">) {
  const { token } = await ctx.params;
  const storeId = readPosterToken(token);
  if (!storeId) return Response.json({ detail: "This link isn't valid." }, { status: 404, headers });
  if (tooMany(`${clientKey(request)}:${storeId}`)) {
    return Response.json({ detail: "Too many tries. Please call or ask the café." }, { status: 429, headers });
  }
  const b = await request.json().catch(() => null);
  if (!b) return Response.json({ detail: "Invalid request." }, { status: 422, headers });
  const n = Number(b.order_number);
  try {
    const res = await backend(`/stores/${storeId}/car/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_number: Number.isInteger(n) && n > 0 ? n : null,
        what: String(b.what ?? "").slice(0, 300),
        customer_name: String(b.customer_name ?? "").slice(0, 40),
        car_plate: String(b.car_plate ?? "").slice(0, 20),
        car_color: b.car_color ? String(b.car_color).slice(0, 20) : null,
        car_model: b.car_model ? String(b.car_model).slice(0, 40) : null,
        car_note: b.car_note ? String(b.car_note).slice(0, 60) : null,
      }),
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status, headers });
  } catch {
    return Response.json({ detail: "Can't reach the café right now." }, { status: 502, headers });
  }
}
