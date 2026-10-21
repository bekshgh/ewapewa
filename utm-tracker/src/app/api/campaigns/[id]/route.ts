import { canEditCampaign, forbidden, guard } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { projectName } from "@/lib/projects/validation";
import { parseProjectName, seasonOf } from "@/lib/naming";
import { campaignLinksWhere } from "@/lib/linkKitServer";

const patchSchema = z.object({
  status: z.enum(["active", "paused", "archived"]).optional(),
  /** "<Project> F'26": the folder grouping and the project page follow it. */
  label: projectName.optional(),
  type: z.string().trim().max(80).nullable().optional(),
  funnel: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
});

/**
 * PATCH { status?, label?, type?, funnel?, description? }. The utm_campaign
 * value (name) is not editable: links and leads already carry it.
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  if (!(await canEditCampaign(actor, params.id))) return forbidden("this campaign");
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return NextResponse.json({ error: f.label?.[0] ?? f.status?.[0] ?? "Validation failed", issues: f }, { status: 422 });
  }
  const d = parsed.data;
  const term = d.label ? parseProjectName(d.label)?.term : undefined;
  const campaign = await prisma.campaign
    .update({
      where: { id: params.id },
      data: {
        ...(d.status !== undefined && { status: d.status }),
        ...(d.label !== undefined && { label: d.label, ...(term ? { season: seasonOf(term) } : {}) }),
        ...(d.type !== undefined && { type: d.type || null }),
        ...(d.funnel !== undefined && { funnel: d.funnel || null }),
        ...(d.description !== undefined && { description: d.description || null }),
      },
    })
    .catch(() => null);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(campaign);
}

/** Deletes the campaign with all its links (attached or naming it), their clicks and its leads — all or nothing. */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const links = await prisma.trackingLink.findMany({ where: campaignLinksWhere(campaign), select: { id: true } });
  const linkIds = links.map((l) => l.id);

  await prisma.$transaction([
    prisma.clickEvent.deleteMany({ where: { trackingLinkId: { in: linkIds } } }),
    prisma.lead.deleteMany({ where: { OR: [{ utmCampaign: campaign.name }, { trackingLinkId: { in: linkIds } }] } }),
    prisma.trackingLink.deleteMany({ where: { id: { in: linkIds } } }),
    prisma.campaign.delete({ where: { id: params.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
