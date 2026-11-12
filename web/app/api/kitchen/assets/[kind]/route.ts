import { backend, staffStore, SIGN_IN } from "@/lib/backend";

const KINDS = new Set(["logo", "background", "banner"]);
const MAX_BYTES = 2 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function forward(request: Request, kind: string, init: RequestInit) {
  const store = await staffStore(request);
  if (!store) return json(SIGN_IN, 401);
  if (!KINDS.has(kind)) return json({ error: "Unknown image." }, 404);
  try {
    const res = await backend(`/stores/${store}/assets/${kind}`, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: body.detail ?? `Request failed (${res.status}).` }, res.status);
    return json(body);
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}

/** Upload an order-page image (raw bytes in the body). Returns the updated settings. */
export async function PUT(request: Request, ctx: RouteContext<"/api/kitchen/assets/[kind]">) {
  const { kind } = await ctx.params;
  const data = await request.arrayBuffer();
  if (data.byteLength > MAX_BYTES) return json({ error: "Image is larger than 2 MB." }, 413);
  return forward(request, kind, { method: "PUT", body: data });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/kitchen/assets/[kind]">) {
  const { kind } = await ctx.params;
  return forward(request, kind, { method: "DELETE" });
}
