import { backend } from "@/lib/backend";
import { clientKey, limiter } from "@/lib/ratelimit";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const tooMany = limiter(20, 60_000);

/** Which ways the café offers, and what this order chose. */
export async function GET(_request: Request, ctx: RouteContext<"/api/track/[token]/delivery">) {
  const { token } = await ctx.params;
  try {
    const res = await backend(`/track/${encodeURIComponent(token)}/delivery`);
    return Response.json(await res.json().catch(() => ({})), { status: res.status, headers });
  } catch {
    return Response.json({ detail: "Backend unreachable." }, { status: 502, headers });
  }
}

/** The customer chose collect, car (with plate) or table. */
export async function POST(request: Request, ctx: RouteContext<"/api/track/[token]/delivery">) {
  const { token } = await ctx.params;
  if (tooMany(`${clientKey(request)}:${token.slice(0, 12)}`)) {
    return Response.json({ detail: "Too many tries. Wait a minute." }, { status: 429, headers });
  }
  const b = await request.json().catch(() => null);
  if (!b) return Response.json({ detail: "Invalid request." }, { status: 422, headers });
  try {
    const res = await backend(`/track/${encodeURIComponent(token)}/delivery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: String(b.mode ?? ""),
        car_plate: b.car_plate == null ? null : String(b.car_plate).slice(0, 20),
        car_note: b.car_note == null ? null : String(b.car_note).slice(0, 60),
        car_color: b.car_color == null ? null : String(b.car_color).slice(0, 20),
        car_model: b.car_model == null ? null : String(b.car_model).slice(0, 40),
        table_label: b.table_label == null ? null : String(b.table_label).slice(0, 20),
      }),
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status, headers });
  } catch {
    return Response.json({ detail: "Backend unreachable." }, { status: 502, headers });
  }
}
