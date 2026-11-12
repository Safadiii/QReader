import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/session";

/**
 * Staff screens need a sign-in. This only decides where to send the browser;
 * the staff API routes check the session again themselves before doing anything.
 */
export async function proxy(request: NextRequest) {
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/dashboard/:path*", "/kitchen/:path*", "/display/:path*", "/waiting/:path*"],
};
