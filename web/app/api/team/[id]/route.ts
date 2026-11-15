import { backend, isUuid, staffAtLeast } from "@/lib/backend";
import { problem } from "@/lib/problem";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Change a member: { role?, is_active?, name? }. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/team/[id]">) {
  const auth = await staffAtLeast(request, "manager");
  if ("denied" in auth) return auth.denied;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!isUuid(id) || !body) return json({ error: "Invalid request." }, 422);
  const { storeId, userId } = auth.member;
  const change: Record<string, unknown> = {};
  for (const key of ["role", "is_active", "name"]) if (key in body) change[key] = body[key];
  try {
    const res = await backend(`/stores/${storeId}/team/${id}?actor_id=${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (!res.ok) return json({ error: await problem(res) }, res.status);
    return json(await res.json());
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
