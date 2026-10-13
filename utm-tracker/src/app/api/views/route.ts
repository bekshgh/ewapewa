import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTeamMember, unauthorized } from "@/lib/reports/store";
import { parseState, toQuery } from "@/lib/projects/filters/state";
import { savedViewSchema } from "@/lib/projects/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save the current filters + sort as a named view. The query is re-validated and normalised. */
export async function POST(req: Request) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  if (actor.role === "viewer") return NextResponse.json({ error: "Viewers cannot change anything" }, { status: 403 });
  if (!(await isTeamMember())) return unauthorized();
  const parsed = savedViewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  const state = parseState(new URLSearchParams(parsed.data.query), true);
  const view = await prisma.savedView.create({
    data: { name: parsed.data.name, query: toQuery({ ...state, cmp: [] }) },
    select: { id: true, name: true, query: true },
  });
  return NextResponse.json(view, { status: 201 });
}
