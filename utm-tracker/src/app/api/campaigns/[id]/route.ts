import { canEditCampaign, forbidden, guard } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  if (!(await canEditCampaign(actor, params.id))) return forbidden("this campaign");
  const body = await req.json().catch(() => null);
  if (!body?.status) return NextResponse.json({ error: "status required" }, { status: 400 });
  const campaign = await prisma.campaign.update({ where: { id: params.id }, data: { status: body.status } });
  return NextResponse.json(campaign);
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const params = await props.params;
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const links = await prisma.trackingLink.findMany({ where: { utmCampaign: campaign.name }, select: { id: true } });
  const linkIds = links.map((l) => l.id);

  await prisma.clickEvent.deleteMany({ where: { trackingLinkId: { in: linkIds } } });
  await prisma.lead.deleteMany({ where: { utmCampaign: campaign.name } });
  await prisma.trackingLink.deleteMany({ where: { utmCampaign: campaign.name } });
  await prisma.campaign.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
