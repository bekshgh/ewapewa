import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Public endpoints: login, the incoming Tilda webhook, and the on-page
// conversion / submit beacons. /api/webhooks/test stays private (it is an admin action).
const PUBLIC = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/webhooks/tilda-lead",
  "/api/track/conversion",
  "/api/track/submit",
  "/t.js",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow public paths and redirect routes
  if (
    PUBLIC.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/r/") ||
    // Report pages check status/visibility themselves (drafts & private → admins only).
    pathname.startsWith("/report/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    // Tab / home-screen icons from src/app/icon.png and apple-icon.png.
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png"
  ) {
    return NextResponse.next();
  }

  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  const res = NextResponse.redirect(loginUrl);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
