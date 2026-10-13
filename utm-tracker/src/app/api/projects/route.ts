import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTeamMember, newSlug, unauthorized } from "@/lib/reports/store";
import { queryProjects } from "@/lib/projects/query";
import { projectSchema, toDate } from "@/lib/projects/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Filtered projects with facet counts and histograms. The query string is the /projects URL state. */
export async function GET(req: Request) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  if (!(await isTeamMember())) return unauthorized();
  const { state, result } = await queryProjects(prisma, new URL(req.url).searchParams, { admin: true });
  return NextResponse.json({ state, ...result });
}

export async function POST(req: Request) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  if (!(await isTeamMember())) return unauthorized();
  const parsed = projectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const d = parsed.data;
  const type = await prisma.projectType.findUnique({ where: { key: d.typeKey } });
  if (!type) return NextResponse.json({ error: "Unknown project type" }, { status: 422 });
  const project = await prisma.project.create({
    data: {
      slug: newSlug(d.name),
      name: d.name,
      typeId: type.id,
      format: d.format ?? null,
      status: d.status,
      startDate: toDate(d.startDate) ?? null,
      endDate: toDate(d.endDate) ?? null,
      city: d.city,
      venue: d.venue,
      ownerTeam: d.ownerTeam,
      tags: [...new Set(d.tags)],
    },
    select: { id: true, slug: true },
  });
  return NextResponse.json(project, { status: 201 });
}
