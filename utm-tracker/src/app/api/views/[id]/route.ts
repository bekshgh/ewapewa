import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTeamMember, unauthorized } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  if (actor.role === "viewer") return NextResponse.json({ error: "Viewers cannot change anything" }, { status: 403 });
  const params = await props.params;
  if (!(await isTeamMember())) return unauthorized();
  await prisma.savedView.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
