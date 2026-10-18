import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTeamMember, unauthorized } from "@/lib/reports/store";
import { projectPatchSchema, toDate, validationError } from "@/lib/projects/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  if (!(await isTeamMember())) return unauthorized();
  const parsed = projectPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationError(parsed.error), issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const d = parsed.data;
  let typeId: string | undefined;
  if (d.typeKey) {
    const type = await prisma.projectType.findUnique({ where: { key: d.typeKey } });
    if (!type) return NextResponse.json({ error: "Unknown project type" }, { status: 422 });
    typeId = type.id;
  }
  const project = await prisma.project
    .update({
      where: { id: params.id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(typeId ? { typeId } : {}),
        ...(d.format !== undefined ? { format: d.format } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.startDate !== undefined ? { startDate: toDate(d.startDate) } : {}),
        ...(d.endDate !== undefined ? { endDate: toDate(d.endDate) } : {}),
        ...(d.city !== undefined ? { city: d.city } : {}),
        ...(d.venue !== undefined ? { venue: d.venue } : {}),
        ...(d.ownerTeam !== undefined ? { ownerTeam: d.ownerTeam } : {}),
        ...(d.tags !== undefined ? { tags: [...new Set(d.tags)] } : {}),
      },
      select: { id: true, slug: true },
    })
    .catch(() => null);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

/** Deleting a project keeps its reports; they are only detached from it. */
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  if (!(await isTeamMember())) return unauthorized();
  await prisma.project.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
