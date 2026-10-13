import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTeamMember, unauthorized } from "@/lib/reports/store";
import { slug } from "@/lib/reports/extract";
import { projectTypeSchema } from "@/lib/projects/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a project type to the dictionary. A project's type is never free text. */
export async function POST(req: Request) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  if (!(await isTeamMember())) return unauthorized();
  const parsed = projectTypeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  const key = parsed.data.key ?? slug(parsed.data.name).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!/^[a-z0-9_]{2,40}$/.test(key)) {
    return NextResponse.json({ error: "Give the type a latin key, e.g. workshop" }, { status: 422 });
  }
  const max = await prisma.projectType.aggregate({ _max: { sortOrder: true } });
  const type = await prisma.projectType
    .create({ data: { key, name: parsed.data.name, sortOrder: (max._max.sortOrder ?? 0) + 10 } })
    .catch(() => null);
  if (!type) return NextResponse.json({ error: "A type with this key already exists" }, { status: 409 });
  return NextResponse.json(type, { status: 201 });
}
