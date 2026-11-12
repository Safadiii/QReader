import { backend, staffStore, SIGN_IN, type BackendOrder } from "@/lib/backend";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** What the waiting-room TV shows. The TV's browser signs in once. */
export async function GET(request: Request) {
  const store = await staffStore(request);
  if (!store) return json(SIGN_IN, 401);
  try {
    const res = await backend(`/orders/?store_id=${store}`);
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
