import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isTeamMember, readUpload, unauthorized } from "@/lib/reports/store";
import { recomputeProjectMetrics, syncThemeMappings } from "@/lib/projects/recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Replace a report's data with a newer file of the same event (slug and link stay). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  if (!(await isTeamMember())) return unauthorized();
  const existing = await prisma.report.findUnique({ where: { id: params.id }, select: { type: true, projectId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const up = await readUpload(req);
  if (up instanceof NextResponse) return up;
  if (up.doc.type !== existing.type) {
    return NextResponse.json({ error: `This report is ${existing.type}, the file is ${up.doc.type}.`, code: "type_mismatch" }, { status: 422 });
  }

  const report = await prisma.$transaction(async (tx) => {
    const r = await tx.report.update({
      where: { id: params.id },
      data: {
        title: up.doc.title,
        sourceFileName: up.fileName,
        parserVersion: up.doc.parserVersion,
        data: up.doc as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, slug: true },
    });
    await syncThemeMappings(tx, r.id, up.doc);
    if (existing.projectId) await recomputeProjectMetrics(tx, existing.projectId);
    return r;
  });
  return NextResponse.json({ ...report, warnings: up.doc.warnings.length });
}
