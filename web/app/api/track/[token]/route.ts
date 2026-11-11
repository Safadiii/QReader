import { proxyTrack } from "@/lib/backend";

/** Public order status for a QR token. */
export async function GET(_request: Request, ctx: RouteContext<"/api/track/[token]">) {
  return proxyTrack((await ctx.params).token);
}
