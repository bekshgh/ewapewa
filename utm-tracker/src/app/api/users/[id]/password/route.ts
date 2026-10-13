import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, temporaryPassword } from "@/lib/password";

/** POST — an admin resets someone's password; the temporary one is shown once to pass on. */
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const { id } = await props.params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const password = temporaryPassword();
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  return NextResponse.json({ password });
}
