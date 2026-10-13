import { guard } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(req: NextRequest) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const { target, campaignId } = await req.json();

  if (target === "clicks") {
    const where = campaignId
      ? { trackingLink: { utmCampaign: campaignId } }
      : {};
    await prisma.clickEvent.deleteMany({ where });
  } else if (target === "leads") {
    const where = campaignId
      ? { utmCampaign: campaignId }
      : {};
    await prisma.lead.deleteMany({ where });
  } else if (target === "links") {
    if (campaignId) {
      await prisma.trackingLink.deleteMany({ where: { utmCampaign: campaignId } });
    } else {
      await prisma.clickEvent.deleteMany({});
      await prisma.lead.deleteMany({});
      await prisma.trackingLink.deleteMany({});
    }
  } else if (target === "all") {
    await prisma.webhookLog.deleteMany({});
    await prisma.clickEvent.deleteMany({});
    await prisma.lead.deleteMany({});
    await prisma.trackingLink.deleteMany({});
    await prisma.campaign.deleteMany({});
  } else {
    return NextResponse.json({ error: "Unknown target" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
