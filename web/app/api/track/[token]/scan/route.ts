import { proxyTrack } from "@/lib/backend";

/** The customer's phone opened the tracking page: this is the scan. */
export async function POST(_request: Request, ctx: RouteContext<"/api/track/[token]/scan">) {
  return proxyTrack((await ctx.params).token, "/scan");
}
