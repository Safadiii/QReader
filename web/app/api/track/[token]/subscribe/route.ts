import { backend } from "@/lib/backend";

/**
 * The customer's phone (App Clip or browser) asks to be pushed when its order
 * is ready. The backend validates the body; this only forwards it.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/track/[token]/subscribe">) {
  const { token } = await ctx.params;
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ detail: "Invalid request." }, { status: 422, headers });
  try {
    const res = await backend(`/track/${encodeURIComponent(token)}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status, headers });
  } catch {
    return Response.json({ detail: "Backend unreachable." }, { status: 502, headers });
  }
}
