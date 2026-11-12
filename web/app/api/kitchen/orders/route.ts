import { backend, staffStore, SIGN_IN } from "@/lib/backend";

/*
 * Staff routes for the kitchen screen and dashboard: a signed-in session is
 * required, and everything is limited to that staff member's own store.
 */

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The store's recent orders, newest first. */
export async function GET(request: Request) {
  const store = await staffStore(request);
  if (!store) return json(SIGN_IN, 401);
  try {
    const res = await backend(`/orders/?store_id=${store}`);
    if (!res.ok) return json({ error: `Orders request failed (${res.status}).` }, 502);
    return json({ orders: await res.json() });
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}

/** Ring up a new order: { orderNumber }. */
export async function POST(request: Request) {
  const store = await staffStore(request);
  if (!store) return json(SIGN_IN, 401);
  const body = await request.json().catch(() => null);
  const orderNumber = Number(body?.orderNumber);
  if (!Number.isInteger(orderNumber) || orderNumber <= 0) {
    return json({ error: "Order number must be a whole number above zero." }, 422);
  }
  try {
    const res = await backend("/orders/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_id: store, order_number: orderNumber }),
    });
    if (res.status === 409) return json({ error: "That number is already used today." }, 409);
    if (!res.ok) return json({ error: `Could not create the order (${res.status}).` }, 502);
    return json({ order: await res.json() }, 201);
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
