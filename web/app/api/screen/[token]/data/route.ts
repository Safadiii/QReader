import { loadDisplay, loadWaiting, resolveScreen } from "@/lib/screen-data";

/** The live data for a screen opened from its link (no sign-in; the link is the key). */
export async function GET(request: Request, ctx: RouteContext<"/api/screen/[token]/data">) {
  const { token } = await ctx.params;
  const screen = await resolveScreen(token);
  if (!screen) {
    return Response.json(
      { error: "This link is no longer valid." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return screen.kind === "display" ? loadDisplay(screen.store_id, request) : loadWaiting(screen.store_id);
}
