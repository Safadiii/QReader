import { sessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(null, request) } });
}
