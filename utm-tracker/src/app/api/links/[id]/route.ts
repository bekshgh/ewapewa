import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canEditLink, forbidden, guard } from "@/lib/auth";
import { updateLinkSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await req.json().catch(() => null);
  const parsed = updateLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const d = parsed.data;
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const current = await prisma.trackingLink.findUnique({ where: { id: params.id }, select: { campaignId: true, utmCampaign: true } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Both where the link is now and where the change would put it must be the manager's.
  const next = {
    campaignId: d.campaignId !== undefined ? d.campaignId || null : current.campaignId,
    utmCampaign: d.utmCampaign !== undefined ? d.utmCampaign || null : current.utmCampaign,
  };
  if (!(await canEditLink(actor, current)) || !(await canEditLink(actor, next))) return forbidden("this link");
  const link = await prisma.trackingLink.update({
    where: { id: params.id },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.destinationUrl !== undefined && { destinationUrl: d.destinationUrl }),
      ...(d.campaignId !== undefined && { campaignId: d.campaignId || null }),
      ...(d.utmSource !== undefined && { utmSource: d.utmSource || null }),
      ...(d.utmMedium !== undefined && { utmMedium: d.utmMedium || null }),
      ...(d.utmCampaign !== undefined && { utmCampaign: d.utmCampaign || null }),
      ...(d.utmContent !== undefined && { utmContent: d.utmContent || null }),
      ...(d.utmTerm !== undefined && { utmTerm: d.utmTerm || null }),
      ...(d.notes !== undefined && { notes: d.notes || null }),
      ...(d.tags !== undefined && { tags: d.tags }),
      ...(d.isActive !== undefined && { isActive: d.isActive }),
      ...(d.isArchived !== undefined && { isArchived: d.isArchived }),
    },
  });
  return NextResponse.json(link);
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  const current = await prisma.trackingLink.findUnique({ where: { id: params.id }, select: { campaignId: true, utmCampaign: true } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canEditLink(actor, current))) return forbidden("this link");
  await prisma.trackingLink.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
