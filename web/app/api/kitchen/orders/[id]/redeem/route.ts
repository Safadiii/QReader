import { isUuid } from "@/lib/backend";
import { loyaltyProxy } from "@/lib/loyalty-proxy";

/** One tap on an order's ticket: give this order's customer their free reward. */
export async function POST(request: Request, ctx: RouteContext<"/api/kitchen/orders/[id]/redeem">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Invalid request." }, { status: 422 });
  return loyaltyProxy(request, "staff", `/orders/${id}/redeem`, { method: "POST" });
}
