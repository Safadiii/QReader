import { backend } from "@/lib/backend";
import { cardCookie, cardSecret } from "@/lib/card-cookie";
import { clientKey, limiter } from "@/lib/ratelimit";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
// A PIN has only 10,000 possibilities: the backend locks a number after 5 wrong tries, and this
// slows down anyone trying many numbers from one place.
const tooMany = limiter(10, 60_000);

const KNOWN = new Set(["wrong_pin", "locked", "card_has_phone", "try_again"]);

/** Save the phone's card to a phone number + PIN, or sign in to the card saved to that number. */
export async function POST(request: Request, ctx: RouteContext<"/api/track/[token]/loyalty/phone">) {
  const { token } = await ctx.params;
  if (tooMany(clientKey(request))) return Response.json({ error: "slow" }, { status: 429, headers });
  const body = await request.json().catch(() => null);
  const device = cardSecret(request, body?.device);
  const phone = String(body?.phone ?? "");
  const pin = String(body?.pin ?? "");
  if (!device || !/^\+\d{8,15}$/.test(phone) || !/^\d{4}$/.test(pin)) {
    return Response.json({ error: "invalid" }, { status: 422, headers });
  }
  try {
    const res = await backend(`/track/${encodeURIComponent(token)}/loyalty/phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device, phone, pin }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof out.detail === "string" && KNOWN.has(out.detail) ? out.detail : res.status === 422 ? "invalid" : "unavailable";
      return Response.json({ error: detail }, { status: res.status === 403 || res.status === 409 ? res.status : res.status === 422 ? 422 : 502, headers });
    }
    return Response.json({ ...out, device }, { headers: { ...headers, "Set-Cookie": cardCookie(device, request) } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502, headers });
  }
}
