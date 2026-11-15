import { staffStore, SIGN_IN } from "@/lib/backend";
import { loadDisplay } from "@/lib/screen-data";

/** The order the till screen should show right now (for a signed-in staff device). */
export async function GET(request: Request) {
  const storeId = await staffStore(request);
  if (!storeId) return Response.json(SIGN_IN, { status: 401, headers: { "Cache-Control": "no-store" } });
  return loadDisplay(storeId, request);
}
