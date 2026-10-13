import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isTeamMember, unauthorized } from "@/lib/reports/store";
import { THEMES } from "@/lib/projects/dictionaries";
import { recomputeProjectMetrics } from "@/lib/projects/recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  mappings: z
    .array(z.object({ id: z.string().min(1), canonical: z.string().nullable() }))
    .max(200),
});

/** Confirm / correct the open-answer theme → canonical theme mapping; the project's metrics follow. */
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  if (!(await isTeamMember())) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  const keys = new Set(THEMES.map((t) => t.key));
  if (parsed.data.mappings.some((m) => m.canonical !== null && !keys.has(m.canonical))) {
    return NextResponse.json({ error: "Unknown theme" }, { status: 422 });
  }
  const report = await prisma.report.findUnique({ where: { id: params.id }, select: { projectId: true } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    for (const m of parsed.data.mappings) {
      await tx.themeMapping.updateMany({ where: { id: m.id, reportId: params.id }, data: { canonical: m.canonical, confirmed: true } });
    }
    if (report.projectId) await recomputeProjectMetrics(tx, report.projectId);
  });
  return NextResponse.json({ ok: true });
}
