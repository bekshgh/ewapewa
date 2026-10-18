import { canCreateCampaign, guard } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCampaignSchema } from "@/lib/validation";
import { parseProjectName, seasonOf, utmCampaignOf } from "@/lib/naming";

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
    const f = parsed.error.flatten().fieldErrors;
    return NextResponse.json({ error: f.label?.[0] ?? "Validation failed", issues: f }, { status: 422 });
  }
  const term = parseProjectName(parsed.data.label)?.term;
  const data = {
    ...parsed.data,
    name: parsed.data.name || utmCampaignOf(parsed.data.label),
    season: parsed.data.season || (term ? seasonOf(term) : null),
  };
  if (!(await canCreateCampaign(actor, data))) {
    return NextResponse.json({ error: "Name the campaign after one of your projects, e.g. \"<project> EwA2oGX F'26\"" }, { status: 403 });
  }
  const campaign = await prisma.campaign.create({ data });
  return NextResponse.json(campaign, { status: 201 });
}
