import "server-only";
import { backend, staffAtLeast } from "@/lib/backend";
import { problem } from "@/lib/problem";
import type { Role } from "@/lib/roles";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Forwards a staff request to the loyalty endpoints of the backend, as the signed-in member.
 * `path` is what comes after /stores/{store}/loyalty, e.g. "/stats".
 */
export async function loyaltyProxy(
  request: Request,
  min: Role,
  path: string,
  init?: { method?: string; body?: unknown },
) {
  const auth = await staffAtLeast(request, min);
  if ("denied" in auth) return auth.denied;
  const { storeId, userId } = auth.member;
  try {
    const res = await backend(`/stores/${storeId}/loyalty${path}${path.includes("?") ? "&" : "?"}actor_id=${userId}`, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) return json({ error: await problem(res) }, [403, 404, 409, 422].includes(res.status) ? res.status : 502);
    return json(await res.json());
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
