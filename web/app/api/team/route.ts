import { backend, staffAtLeast } from "@/lib/backend";
import { problem } from "@/lib/problem";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The store's team. Managers and the owner only. */
export async function GET(request: Request) {
  const auth = await staffAtLeast(request, "manager");
  if ("denied" in auth) return auth.denied;
  const { storeId, userId, role } = auth.member;
  try {
    const res = await backend(`/stores/${storeId}/team?actor_id=${userId}`);
    if (!res.ok) return json({ error: await problem(res) }, res.status === 403 ? 403 : 502);
    return json({ members: await res.json(), me: userId, myRole: role });
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}

/** Add a member: { name, phone, role }. Returns their one-time password. */
export async function POST(request: Request) {
  const auth = await staffAtLeast(request, "manager");
  if ("denied" in auth) return auth.denied;
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid request." }, 422);
  const { storeId, userId } = auth.member;
  try {
    const res = await backend(`/stores/${storeId}/team?actor_id=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: body.name, phone: body.phone, role: body.role }),
    });
    if (!res.ok) return json({ error: await problem(res) }, res.status);
    return json(await res.json(), 201);
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
