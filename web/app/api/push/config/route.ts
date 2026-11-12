import { backend } from "@/lib/backend";

/** Public: what a browser needs to subscribe to pushes (the VAPID public key). */
export async function GET() {
  try {
    const res = await backend("/push/config");
    if (!res.ok) return Response.json({ vapid_public_key: null, apns_configured: false });
    return Response.json(await res.json(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ vapid_public_key: null, apns_configured: false });
  }
}
