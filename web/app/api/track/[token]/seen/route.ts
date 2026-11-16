import { proxyTrack } from "@/lib/backend";

/** The customer opened their page after the order became ready. */
export async function POST(_request: Request, ctx: RouteContext<"/api/track/[token]/seen">) {
  return proxyTrack((await ctx.params).token, "/seen");
}
