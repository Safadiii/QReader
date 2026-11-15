import { resolveScreen } from "@/lib/screen-data";

/** Which screen a link is for. Replaced or unknown links get a plain 404. */
export async function GET(_request: Request, ctx: RouteContext<"/api/screen/[token]">) {
  const { token } = await ctx.params;
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const screen = await resolveScreen(token);
  if (!screen) return Response.json({ error: "This link is no longer valid." }, { status: 404, headers });
  return Response.json({ kind: screen.kind, storeName: screen.store_name }, { headers });
}
