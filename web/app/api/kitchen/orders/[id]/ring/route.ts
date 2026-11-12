import { backend, isUuid, staffStore, SIGN_IN } from "@/lib/backend";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Ring the customer's phone again for a ready order. No staff login yet. */
export async function POST(request: Request, ctx: RouteContext<"/api/kitchen/orders/[id]/ring">) {
  const store = await staffStore(request);
  if (!store) return json(SIGN_IN, 401);
  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: "Invalid request." }, 422);
  try {
    const res = await backend(`/orders/${id}/ring?store_id=${store}`, { method: "POST" });
    if (res.status === 409) return json({ error: "Only a ready order can be rung." }, 409);
    if (!res.ok) return json({ error: `Could not ring (${res.status}).` }, 502);
    return json({ order: await res.json() });
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
