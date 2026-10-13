import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isTeamMember, unauthorized } from "@/lib/reports/store";
import { recomputeAll } from "@/lib/projects/recompute";
import { SETTINGS_KEY, getProjectSettings } from "@/lib/projects/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const share = z.number().min(0).max(1);
const schema = z
  .object({
    minResponses: z.number().int().min(1).max(10_000),
    minResponseRate: share,
    smallSampleN: z.number().int().min(1).max(1_000),
    burstyPeakShare: share,
    attentionZone10: z.number().min(0).max(10),
    attentionResponseRate: share,
    noFeedbackDays: z.number().int().min(0).max(365),
    relativeMinProjects: z.number().int().min(2).max(100),
  })
  .partial()
  .strict();

/** Update the project thresholds. Metrics that depend on them are recomputed. */
export async function PATCH(req: Request) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  if (!(await isTeamMember())) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const before = await getProjectSettings(prisma);
  const next = { ...before, ...parsed.data };
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  // "Bursty campaign" is stored in ProjectMetrics, so a new threshold needs a recompute.
  if (next.burstyPeakShare !== before.burstyPeakShare) await recomputeAll(prisma);
  return NextResponse.json(next);
}
