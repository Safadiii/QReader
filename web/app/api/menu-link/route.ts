import { staffAtLeast } from "@/lib/backend";
import { posterToken } from "@/lib/poster";
import { publicBaseUrl } from "@/lib/public-url";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The public address of the café's digital menu (same signed token as the poster). */
export async function GET(request: Request) {
  const auth = await staffAtLeast(request, "manager");
  if ("denied" in auth) return auth.denied;
  const token = posterToken(auth.member.storeId);
  if (!token) return json({ error: "The server is missing SESSION_SECRET (32+ characters) in web/.env.local." }, 500);
  const base = publicBaseUrl(request) ?? new URL(request.url).origin;
  return json({ url: `${base}/menu/${token}`, car_url: `${base}/car/${token}` });
}
