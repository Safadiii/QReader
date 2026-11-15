import { SIGN_IN, backend, staffSession } from "@/lib/backend";

/** Who is signed in and what they may see; the dashboard uses it to show the right menu. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const me = await staffSession(request);
  if (!me) return Response.json(SIGN_IN, { status: 401, headers });
  try {
    const res = await backend(`/auth/members/${me.userId}`);
    const body = res.ok ? await res.json() : null;
    return Response.json(
      { id: me.userId, role: me.role, name: body?.name ?? "", phone: body?.phone ?? "", store: body?.store_name ?? "" },
      { headers },
    );
  } catch {
    return Response.json({ id: me.userId, role: me.role, name: "", phone: "", store: "" }, { headers });
  }
}
