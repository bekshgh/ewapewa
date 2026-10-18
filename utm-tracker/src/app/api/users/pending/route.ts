import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/users/pending — sign-ups waiting for an admin (the badge on Team). */
export async function GET() {
  const a = await guard("admin");
  if (a instanceof NextResponse) return a;
  const pending = await prisma.user.count({ where: { status: "pending" } });
  return NextResponse.json({ pending }, { headers: { "Cache-Control": "no-store" } });
}
