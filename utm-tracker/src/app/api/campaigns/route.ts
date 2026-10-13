import { canCreateCampaign, guard } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCampaignSchema } from "@/lib/validation";

export async function GET() {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { links: true } } },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const body = await req.json().catch(() => null);
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  if (!(await canCreateCampaign(actor, parsed.data))) {
    return NextResponse.json({ error: "Name the campaign after one of your projects, e.g. \"<project> EwA2oGX\"" }, { status: 403 });
  }
  const campaign = await prisma.campaign.create({ data: parsed.data });
  return NextResponse.json(campaign, { status: 201 });
}
