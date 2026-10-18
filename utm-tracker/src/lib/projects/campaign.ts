import type { PrismaClient } from "@prisma/client";
import { parseProjectName, seasonOf, utmCampaignOf } from "@/lib/naming";

/**
 * The project's own campaign (for UTM links and leads), named exactly like the
 * project: label "SheCodes F'26", utm_campaign "shecodes_f26", season
 * "fall 2026". An existing campaign with that label or utm name is reused.
 */
export async function ensureProjectCampaign(db: PrismaClient, project: { name: string; typeName?: string | null }) {
  const name = utmCampaignOf(project.name);
  const existing = await db.campaign.findFirst({
    where: { OR: [{ label: { equals: project.name, mode: "insensitive" } }, { name }] },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };
  const term = parseProjectName(project.name)?.term;
  const c = await db.campaign.create({
    data: { name, label: project.name, season: term ? seasonOf(term) : null, type: project.typeName ?? null, status: "active" },
    select: { id: true },
  });
  return { id: c.id, created: true };
}
