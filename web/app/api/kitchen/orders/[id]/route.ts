import { backend, isUuid, staffStore, SIGN_IN } from "@/lib/backend";

const STATUSES = new Set(["preparing", "ready", "collected", "cancelled"]);

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Move one of the signed-in store's orders along: { status }. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/kitchen/orders/[id]">) {
  const store = await staffStore(request);
  if (!store) return json(SIGN_IN, 401);
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const status = String(body?.status ?? "");
  if (!isUuid(id) || !STATUSES.has(status)) return json({ error: "Invalid request." }, 422);
  try {
    const res = await backend(`/orders/${id}/status?store_id=${store}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.status === 409) return json({ error: "That order has already moved on." }, 409);
    if (!res.ok) return json({ error: `Could not update the order (${res.status}).` }, 502);
    return json({ order: await res.json() });
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
