import { backend, isUuid, staffAtLeast } from "@/lib/backend";
import { problem } from "@/lib/problem";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Give a member a new one-time password (use when they forget it). */
export async function POST(request: Request, ctx: RouteContext<"/api/team/[id]/reset-password">) {
  const auth = await staffAtLeast(request, "manager");
  if ("denied" in auth) return auth.denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: "Invalid request." }, 422);
  const { storeId, userId } = auth.member;
  try {
    const res = await backend(`/stores/${storeId}/team/${id}/reset-password?actor_id=${userId}`, {
      method: "POST",
    });
    if (!res.ok) return json({ error: await problem(res) }, res.status);
    return json(await res.json());
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
