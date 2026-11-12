import { backend, isUuid } from "@/lib/backend";

const KINDS = new Set(["logo", "background", "banner"]);

/** Public: order-page images for the customer's phone. The ?v= in the URL changes on upload. */
export async function GET(_request: Request, ctx: RouteContext<"/api/assets/[storeId]/[kind]">) {
  const { storeId, kind } = await ctx.params;
  if (!isUuid(storeId) || !KINDS.has(kind)) return new Response(null, { status: 404 });
  try {
    const res = await backend(`/stores/${storeId}/assets/${kind}`);
    if (!res.ok) return new Response(null, { status: 404 });
    return new Response(await res.arrayBuffer(), {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
