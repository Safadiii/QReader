import { proxyTrack } from "@/lib/backend";

/** The customer tapped "I'm coming" for a ready order. */
export async function POST(_request: Request, ctx: RouteContext<"/api/track/[token]/coming">) {
  return proxyTrack((await ctx.params).token, "/coming");
}
