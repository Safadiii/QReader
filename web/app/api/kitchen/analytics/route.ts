import { backend, staffStore, SIGN_IN } from "@/lib/backend";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const RANGES = new Set(["7", "30", "90", "365"]);

/** Order statistics for the store over the last ?days= days. */
export async function GET(request: Request) {
  const store = await staffStore(request);
  if (!store) return json(SIGN_IN, 401);
  const asked = new URL(request.url).searchParams.get("days") ?? "30";
  const days = RANGES.has(asked) ? asked : "30";
  try {
    const res = await backend(`/orders/analytics?store_id=${store}&days=${days}`);
    if (!res.ok) return json({ error: `Analytics request failed (${res.status}).` }, 502);
    return json(await res.json());
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
