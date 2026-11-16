import { loyaltyProxy } from "@/lib/loyalty-proxy";

/** Look a customer's card up by the code on their phone. */
export async function GET(request: Request, ctx: RouteContext<"/api/kitchen/loyalty/cards/[code]">) {
  const { code } = await ctx.params;
  if (!/^[A-Za-z0-9 +()-]{4,24}$/.test(code)) return Response.json({ error: "Check the code." }, { status: 422 });
  return loyaltyProxy(request, "staff", `/cards/${encodeURIComponent(code)}`);
}
