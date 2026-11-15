import { staffStore, SIGN_IN } from "@/lib/backend";
import { loadWaiting } from "@/lib/screen-data";

/** What the waiting-room TV shows (for a signed-in staff device). */
export async function GET(request: Request) {
  const store = await staffStore(request);
  if (!store) return Response.json(SIGN_IN, { status: 401, headers: { "Cache-Control": "no-store" } });
  return loadWaiting(store);
}
