import { backend, isUuid, staffAtLeast } from "@/lib/backend";
import { problem } from "@/lib/problem";

const MAX_BYTES = 1024 * 1024;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

type Ctx = RouteContext<"/api/kitchen/menu/items/[id]/photo">;

async function forward(request: Request, id: string, init: RequestInit) {
  const auth = await staffAtLeast(request, "manager");
  if ("denied" in auth) return auth.denied;
  if (!isUuid(id)) return json({ error: "Unknown item." }, 404);
  const { storeId, userId } = auth.member;
  try {
    const res = await backend(`/stores/${storeId}/menu/items/${id}/photo?actor_id=${userId}`, init);
    if (!res.ok) return json({ error: await problem(res) }, [403, 404, 413, 415].includes(res.status) ? res.status : 502);
    return json(await res.json());
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}

/** A staff member's view of an item's photo (the dashboard thumbnail). */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await staffAtLeast(request, "staff");
  if ("denied" in auth) return auth.denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response(null, { status: 404 });
  try {
    const res = await backend(`/stores/${auth.member.storeId}/menu/items/${id}/photo`);
    if (!res.ok) return new Response(null, { status: 404 });
    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "private, max-age=60" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}

/** Upload a photo (raw bytes). */
export async function PUT(request: Request, ctx: Ctx) {
  const data = await request.arrayBuffer();
  if (data.byteLength > MAX_BYTES) return json({ error: "Photo is larger than 1 MB." }, 413);
  return forward(request, (await ctx.params).id, { method: "PUT", body: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).id, { method: "DELETE" });
}
