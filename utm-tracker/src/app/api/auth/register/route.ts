import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { blockedFor, noteAttempt, requestIpHash, tooMany } from "@/lib/authLimit";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail").max(160),
  password: z.string().min(8, "Password: at least 8 characters").max(200),
});

/**
 * POST { name, email, password } — creates an account that waits for an
 * admin's approval. The owner's own e-mail (AUTH_EMAIL) is approved as admin.
 */
export async function POST(req: NextRequest) {
  const ipHash = requestIpHash(req);
  const wait = await blockedFor("register", ipHash);
  if (wait) return NextResponse.json({ error: tooMany(wait) }, { status: 429 });
  await noteAttempt("register", ipHash, true);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 422 });
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "This e-mail is already registered. Sign in instead." }, { status: 409 });

  const owner = !!process.env.AUTH_EMAIL && email === process.env.AUTH_EMAIL.trim().toLowerCase();
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      ...(owner ? { role: "admin" as const, status: "active" as const } : {}),
    },
  });
  return NextResponse.json({ status: user.status }, { status: 201 });
}
