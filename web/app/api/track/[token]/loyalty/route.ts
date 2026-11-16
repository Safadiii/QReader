import { backend } from "@/lib/backend";
import { cardCookie, cardSecret } from "@/lib/card-cookie";
import { clientKey, limiter } from "@/lib/ratelimit";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const tooMany = limiter(30, 60_000);

/** The customer's phone opened its order: returns its stamp card (and counts this order's stamp). */
export async function POST(request: Request, ctx: RouteContext<"/api/track/[token]/loyalty">) {
  const { token } = await ctx.params;
  if (tooMany(clientKey(request))) return Response.json({ error: "slow" }, { status: 429, headers });
  const body = await request.json().catch(() => null);
  const device = cardSecret(request, body?.device);
  if (!device) return Response.json({ error: "invalid" }, { status: 422, headers });
  try {
    const res = await backend(`/track/${encodeURIComponent(token)}/loyalty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return Response.json({ error: "unavailable" }, { status: res.status, headers });
    // `device` goes back so the page can refill its own copy if the browser wiped it.
    return Response.json({ ...out, device }, { headers: { ...headers, "Set-Cookie": cardCookie(device, request) } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502, headers });
  }
}
