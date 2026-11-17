import { backend, isUuid } from "@/lib/backend";
import { readPosterToken } from "@/lib/poster";

/** A menu item's photo for customers, found through the menu link's signed token. */
export async function GET(_request: Request, ctx: RouteContext<"/api/menu/[token]/photo/[id]">) {
  const { token, id } = await ctx.params;
  const storeId = readPosterToken(token);
  if (!storeId || !isUuid(id)) return new Response(null, { status: 404 });
  try {
    const res = await backend(`/stores/${storeId}/menu/items/${id}/photo`);
    if (!res.ok) return new Response(null, { status: 404 });
    return new Response(await res.arrayBuffer(), {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
