import { backend, staffStore, SIGN_IN } from "@/lib/backend";

/* Staff routes: a signed-in session is required. */

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Turns the backend's validation errors into one readable line. */
async function problem(res: Response) {
  const body = await res.json().catch(() => ({}));
  const detail = body.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]) {
    const field = String(detail[0].loc?.at(-1) ?? "").replaceAll("_", " ");
    return `${field}: ${String(detail[0].msg).replace(/^Value error, /, "")}`;
  }
  return `Request failed (${res.status}).`;
}

export async function GET(request: Request) {
  const store = await staffStore(request);
  if (!store) return json(SIGN_IN, 401);
  try {
    const res = await backend(`/stores/${store}/settings`);
    if (!res.ok) return json({ error: await problem(res) }, 502);
    return json(await res.json());
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}

export async function PUT(request: Request) {
  const store = await staffStore(request);
  if (!store) return json(SIGN_IN, 401);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid request." }, 422);
  try {
    const res = await backend(`/stores/${store}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return json({ error: await problem(res) }, res.status === 422 ? 422 : 502);
    return json(await res.json());
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
