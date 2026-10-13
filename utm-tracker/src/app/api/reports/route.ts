import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTeamMember, newSlug, readUpload, unauthorized } from "@/lib/reports/store";
import { recomputeProjectMetrics, syncThemeMappings } from "@/lib/projects/recompute";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Upload an analysis workbook → parsed draft report (preview before publishing). */
export async function POST(req: Request) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  if (!(await isTeamMember())) return unauthorized();
  const up = await readUpload(req);
  if (up instanceof NextResponse) return up;

  const eventName = up.eventName ?? up.doc.meta.eventName ?? null;
  const project = up.projectId ? await prisma.project.findUnique({ where: { id: up.projectId }, select: { id: true } }) : null;
  if (up.projectId && !project) return NextResponse.json({ error: "Project not found", code: "no_project" }, { status: 422 });

  // Report, its theme mappings and the project's metrics change together.
  const report = await prisma.$transaction(async (tx) => {
    const r = await tx.report.create({
      data: {
        slug: newSlug(`${eventName ?? up.doc.title} ${up.doc.type}`),
        type: up.doc.type,
        title: up.doc.title,
        eventName,
        sourceFileName: up.fileName,
        parserVersion: up.doc.parserVersion,
        data: up.doc as unknown as Prisma.InputJsonValue,
        projectId: project?.id ?? null,
      },
      select: { id: true, slug: true },
    });
    await syncThemeMappings(tx, r.id, up.doc);
    if (project) await recomputeProjectMetrics(tx, project.id);
    return r;
  });
  return NextResponse.json({ ...report, warnings: up.doc.warnings.length }, { status: 201 });
}
