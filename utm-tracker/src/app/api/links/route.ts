import { canEditLink, guard } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createLinkSchema } from "@/lib/validation";
import { generateSlug } from "@/lib/utils";

export async function GET() {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const links = await prisma.trackingLink.findMany({
    orderBy: { createdAt: "desc" },
    include: { campaign: true, _count: { select: { clicks: true, leads: true } } },
  });
  return NextResponse.json(links);
}

export async function POST(req: NextRequest) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const body = await req.json().catch(() => null);
  const parsed = createLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }
  const data = parsed.data;
  if (!(await canEditLink(actor, data))) {
    return NextResponse.json({ error: "Put the link in a campaign of one of your projects" }, { status: 403 });
  }

  // ensure slug uniqueness; auto-generate if taken/empty
  let slug = data.slug?.trim() || generateSlug();
  let attempts = 0;
  while (await prisma.trackingLink.findUnique({ where: { slug } })) {
    if (data.slug && attempts === 0) {
      return NextResponse.json({ error: "Validation failed", issues: { slug: ["This slug is already taken"] } }, { status: 409 });
    }
    slug = generateSlug();
    if (++attempts > 5) break;
  }

  const link = await prisma.trackingLink.create({
    data: {
      name: data.name,
      slug,
      destinationUrl: data.destinationUrl,
      campaignId: data.campaignId || null,
      utmSource: data.utmSource || null,
      utmMedium: data.utmMedium || null,
      utmCampaign: data.utmCampaign || null,
      utmContent: data.utmContent || null,
      utmTerm: data.utmTerm || null,
      customParams: data.customParams ?? undefined,
      tags: data.tags ?? [],
      notes: data.notes || null,
    },
  });

  return NextResponse.json(link, { status: 201 });
}
