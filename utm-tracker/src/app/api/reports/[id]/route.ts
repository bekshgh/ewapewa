import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isTeamMember, unauthorized } from "@/lib/reports/store";
import { recomputeProjectMetrics } from "@/lib/projects/recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    status: z.enum(["draft", "published"]).optional(),
    visibility: z.enum(["private", "link", "public"]).optional(),
    eventName: z.string().trim().max(120).nullable().optional(),
    projectId: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

/** Publish / unpublish, change visibility, rename the event. */
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  if (!(await isTeamMember())) return unauthorized();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  const current = await prisma.report.findUnique({ where: { id: params.id }, select: { publishedAt: true, projectId: true } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { status, visibility, eventName, projectId } = parsed.data;
  if (projectId && !(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Project not found" }, { status: 422 });
  }
  const report = await prisma.$transaction(async (tx) => {
    const r = await tx.report.update({
      where: { id: params.id },
      data: {
        ...(status ? { status, publishedAt: status === "published" ? current.publishedAt ?? new Date() : current.publishedAt } : {}),
        ...(visibility ? { visibility } : {}),
        ...(eventName !== undefined ? { eventName: eventName || null } : {}),
        ...(projectId !== undefined ? { projectId: projectId || null } : {}),
      },
      select: { id: true, slug: true, status: true, visibility: true, eventName: true, projectId: true },
    });
    // Both the project it left and the one it joined change.
    for (const pid of new Set([current.projectId, r.projectId])) if (pid) await recomputeProjectMetrics(tx, pid);
    return r;
  });
  return NextResponse.json(report);
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  if (!(await isTeamMember())) return unauthorized();
  await prisma.$transaction(async (tx) => {
    const r = await tx.report.findUnique({ where: { id: params.id }, select: { projectId: true } });
    if (!r) return;
    await tx.report.delete({ where: { id: params.id } });
    if (r.projectId) await recomputeProjectMetrics(tx, r.projectId);
  });
  return NextResponse.json({ ok: true });
}
