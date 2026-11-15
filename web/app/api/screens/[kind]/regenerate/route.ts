import { backend, staffAtLeast } from "@/lib/backend";
import { problem } from "@/lib/problem";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Replace a screen's link; the old one stops working immediately. */
export async function POST(request: Request, ctx: RouteContext<"/api/screens/[kind]/regenerate">) {
  const auth = await staffAtLeast(request, "manager");
  if ("denied" in auth) return auth.denied;
  const { kind } = await ctx.params;
  if (kind !== "display" && kind !== "waiting") return json({ error: "Unknown screen." }, 404);
  const { storeId, userId } = auth.member;
  try {
    const res = await backend(`/stores/${storeId}/screens/${kind}/regenerate?actor_id=${userId}`, {
      method: "POST",
    });
    if (!res.ok) return json({ error: await problem(res) }, res.status);
    return json({ ok: true });
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
