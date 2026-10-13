import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "New password: at least 8 characters").max(200).optional(),
});

/** PATCH { name?, currentPassword?, newPassword? } — your own name and password. */
export async function PATCH(req: NextRequest) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  if (actor.owner) return NextResponse.json({ error: "The owner login is set in Vercel (AUTH_EMAIL / AUTH_PASSWORD). Register a personal account to have a profile." }, { status: 409 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 422 });
  const d = parsed.data;

  let passwordHash: string | undefined;
  if (d.newPassword) {
    const user = await prisma.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(d.currentPassword ?? "", user?.passwordHash))) {
      return NextResponse.json({ error: "Current password is wrong" }, { status: 403 });
    }
    passwordHash = await hashPassword(d.newPassword);
  }
  await prisma.user.update({
    where: { id: actor.id },
    data: { ...(d.name && { name: d.name }), ...(passwordHash && { passwordHash }) },
  });
  return NextResponse.json({ ok: true });
}
