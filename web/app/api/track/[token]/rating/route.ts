import { backend } from "@/lib/backend";

/** The customer rates their order after pickup: { stars }. */
export async function POST(request: Request, ctx: RouteContext<"/api/track/[token]/rating">) {
  const { token } = await ctx.params;
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const body = await request.json().catch(() => null);
  const stars = Number(body?.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return Response.json({ detail: "Invalid rating." }, { status: 422, headers });
  }
  try {
    const res = await backend(`/track/${encodeURIComponent(token)}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars }),
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status, headers });
  } catch {
    return Response.json({ detail: "Backend unreachable." }, { status: 502, headers });
  }
}
