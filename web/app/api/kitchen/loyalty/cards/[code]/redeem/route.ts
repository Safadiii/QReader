import { loyaltyProxy } from "@/lib/loyalty-proxy";

/** Hand out the reward on this card: it uses up the stamps. */
export async function POST(request: Request, ctx: RouteContext<"/api/kitchen/loyalty/cards/[code]/redeem">) {
  const { code } = await ctx.params;
  if (!/^[A-Za-z0-9 +()-]{4,24}$/.test(code)) return Response.json({ error: "Check the code." }, { status: 422 });
  return loyaltyProxy(request, "staff", `/cards/${encodeURIComponent(code)}/redeem`, { method: "POST" });
}
