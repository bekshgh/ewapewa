import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

function clear(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}

export async function POST() {
  return clear(NextResponse.json({ ok: true }));
}

/** GET ?reason=… — used when an account is disabled mid-session: sign out and go to the login page. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const reason = req.nextUrl.searchParams.get("reason");
  if (reason) url.searchParams.set("reason", reason);
  return clear(NextResponse.redirect(url));
}
