import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { OWNER, SESSION_COOKIE, SESSION_MAX_AGE_SEC, createSessionToken, safeEqual } from "@/lib/session";
import { blockedFor, noteAttempt, requestIpHash, tooMany } from "@/lib/authLimit";

/** POST { email, password } — a team account, or the owner (AUTH_EMAIL / AUTH_PASSWORD). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const mail = email.toLowerCase().trim();
  const ipHash = requestIpHash(req);
  const wait = await blockedFor("login", ipHash);
  if (wait) return NextResponse.json({ error: tooMany(wait) }, { status: 429 });

  let subject: string | null = null;
  const user = await prisma.user.findUnique({ where: { email: mail } });
  if (user && (await verifyPassword(password, user.passwordHash))) {
    if (user.status === "pending") return NextResponse.json({ error: "Your account is waiting for an admin's approval." }, { status: 403 });
    if (user.status === "disabled") return NextResponse.json({ error: "Your account is disabled. Ask an admin." }, { status: 403 });
    if (user.status === "declined") return NextResponse.json({ error: "Your sign-up was declined. Ask an admin if this is a mistake." }, { status: 403 });
    subject = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  } else {
    const ownerEmail = process.env.AUTH_EMAIL;
    const ownerPassword = process.env.AUTH_PASSWORD;
    if (ownerEmail && ownerPassword && mail === ownerEmail.toLowerCase().trim() && safeEqual(password, ownerPassword)) subject = OWNER;
  }
  await noteAttempt("login", ipHash, !!subject);
  if (!subject) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const token = await createSessionToken(subject);
  if (!token) {
    return NextResponse.json(
      { error: "Server misconfigured: AUTH_SECRET must be set (16+ characters)" },
      { status: 500 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  });

  return res;
}
