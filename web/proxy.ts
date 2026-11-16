import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/session";
import { atLeast } from "@/lib/roles";

/** Dashboard pages that staff may not open. The API checks the role again on every call. */
const MANAGER_PAGES = [
  "/dashboard/analytics",
  "/dashboard/extras",
  "/dashboard/page",
  "/dashboard/settings",
  "/dashboard/team",
  "/dashboard/screens",
];

/**
 * Staff screens need a sign-in. This only decides where to send the browser;
 * the staff API routes check the session and role again themselves before doing anything.
 */
export async function proxy(request: NextRequest) {
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  const path = request.nextUrl.pathname;
  if (MANAGER_PAGES.some((p) => path === p || path.startsWith(`${p}/`)) && !atLeast(session.role, "manager")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/kitchen/:path*", "/display/:path*", "/waiting/:path*"],
};
