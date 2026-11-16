import { backend } from "@/lib/backend";
import { cardCookie, cardSecret } from "@/lib/card-cookie";
import { clientKey, limiter } from "@/lib/ratelimit";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
// Codes are 8 random characters; this only has to stop someone trying them in bulk.
const tooMany = limiter(8, 60_000);

/** A phone that lost its card claims it back with the card's code. */
export async function POST(request: Request, ctx: RouteContext<"/api/track/[token]/loyalty/restore">) {
  const { token } = await ctx.params;
  if (tooMany(clientKey(request))) return Response.json({ error: "slow" }, { status: 429, headers });
  const body = await request.json().catch(() => null);
  const device = cardSecret(request, body?.device);
  const code = String(body?.code ?? "").trim();
  if (!device || !/^[A-Za-z0-9 -]{4,12}$/.test(code)) return Response.json({ error: "invalid" }, { status: 422, headers });
  try {
    const res = await backend(`/track/${encodeURIComponent(token)}/loyalty/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device, code }),
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 404) return Response.json({ error: "not_found" }, { status: 404, headers });
    if (!res.ok) return Response.json({ error: "unavailable" }, { status: 502, headers });
    return Response.json({ ...out, device }, { headers: { ...headers, "Set-Cookie": cardCookie(device, request) } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502, headers });
  }
}
