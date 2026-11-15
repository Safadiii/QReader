import { backend, staffAtLeast } from "@/lib/backend";
import { problem } from "@/lib/problem";
import { publicBaseUrl } from "@/lib/public-url";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The addresses to open on the iPad (customer QR) and the TV (ready orders). */
export async function GET(request: Request) {
  const auth = await staffAtLeast(request, "manager");
  if ("denied" in auth) return auth.denied;
  const { storeId, userId } = auth.member;
  try {
    const res = await backend(`/stores/${storeId}/screens?actor_id=${userId}`);
    if (!res.ok) return json({ error: await problem(res) }, res.status);
    const links = await res.json();
    // On a dev machine "localhost" means the device itself, so use the computer's network address.
    const base = publicBaseUrl(request) ?? new URL(request.url).origin;
    return json({
      display: `${base}/screen/${links.display_token}`,
      waiting: `${base}/screen/${links.waiting_token}`,
    });
  } catch {
    return json({ error: "Backend unreachable." }, 502);
  }
}
