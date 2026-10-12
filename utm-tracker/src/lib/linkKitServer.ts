import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEFAULT_TEMPLATE, PREFIX_RE, cleanRow, planKit, rowKey, type KitRow, type KitTemplate, type PlannedRow } from "@/lib/linkKit";

const TEMPLATES_KEY = "links.templates";

const rowSchema = z.object({
  source: z.string().trim().min(1, "Each row needs a source").max(80),
  medium: z.string().trim().max(80).default(""),
  content: z.string().trim().max(120).default(""),
  destinationUrl: z.string().trim().url("Row link must be a full address, https://…").optional().or(z.literal("")),
});
export const templateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  rows: z.array(rowSchema).min(1).max(100),
});
export const kitSchema = z.object({
  slugPrefix: z.string().trim().toLowerCase().regex(PREFIX_RE, "Project code: 2–12 latin letters or digits, e.g. tts"),
  destinationUrl: z.string().trim().url("Enter the landing page address, https://…"),
  rows: z.array(rowSchema).min(1, "Add at least one link").max(100),
});

export class KitError extends Error {}

/** Templates saved by the team (the default one is always offered first). */
export async function savedTemplates(): Promise<KitTemplate[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: TEMPLATES_KEY } });
  const parsed = z.array(templateSchema).safeParse(row?.value ?? []);
  return parsed.success ? (parsed.data as KitTemplate[]) : [];
}

export async function allTemplates(): Promise<KitTemplate[]> {
  return [DEFAULT_TEMPLATE, ...(await savedTemplates())];
}

async function writeTemplates(list: KitTemplate[]) {
  await prisma.appSetting.upsert({
    where: { key: TEMPLATES_KEY },
    create: { key: TEMPLATES_KEY, value: list as unknown as Prisma.InputJsonValue },
    update: { value: list as unknown as Prisma.InputJsonValue },
  });
}

/** Save (or replace by name) a template. */
export async function saveTemplate(t: KitTemplate) {
  if (t.name === DEFAULT_TEMPLATE.name) throw new KitError("Choose another name: this one is the built-in template.");
  const list = (await savedTemplates()).filter((x) => x.name !== t.name);
  await writeTemplates([...list, { name: t.name, rows: t.rows.map(cleanRow) }]);
}

export async function deleteTemplate(name: string) {
  await writeTemplates((await savedTemplates()).filter((x) => x.name !== name));
}

const campaignLinksWhere = (c: { id: string; name: string }) => ({ OR: [{ campaignId: c.id }, { utmCampaign: c.name }] });

/** The source / medium / content rows of a campaign's links, oldest first, without repeats. */
export async function campaignStructure(campaignId: string): Promise<KitRow[]> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, name: true } });
  if (!c) throw new KitError("Campaign not found.");
  const links = await prisma.trackingLink.findMany({
    where: { ...campaignLinksWhere(c), isArchived: false },
    select: { utmSource: true, utmMedium: true, utmContent: true },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  const rows: KitRow[] = [];
  for (const l of links) {
    const r = cleanRow({ source: l.utmSource ?? "", medium: l.utmMedium ?? "", content: l.utmContent ?? "" });
    if (!r.source || seen.has(rowKey(r))) continue;
    seen.add(rowKey(r));
    rows.push(r);
  }
  return rows;
}

/** Everything the builder page needs to preview slugs exactly as creation will. */
export async function kitContext(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;
  const [links, slugs, campaigns, templates] = await Promise.all([
    prisma.trackingLink.findMany({
      where: campaignLinksWhere(campaign),
      select: { slug: true, utmSource: true, utmMedium: true, utmContent: true, destinationUrl: true, isArchived: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.trackingLink.findMany({ select: { slug: true } }),
    prisma.campaign.findMany({
      where: { id: { not: campaign.id } },
      select: { id: true, name: true, label: true },
      orderBy: { createdAt: "desc" },
    }),
    allTemplates(),
  ]);
  // The landing most of the campaign's links already point to, as a starting value.
  const dest = new Map<string, number>();
  for (const l of links) dest.set(l.destinationUrl, (dest.get(l.destinationUrl) ?? 0) + 1);
  const commonDestination = [...dest.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return { campaign, links, takenSlugs: slugs.map((s) => s.slug), campaigns, templates, commonDestination };
}

export interface KitResult {
  rows: (PlannedRow & { destinationUrl: string })[];
  created: number;
}

/**
 * Saves the campaign's project code and creates the links that do not exist
 * yet. Rows the campaign already has, and repeats inside the kit, are skipped.
 */
export async function createKit(campaignId: string, input: z.infer<typeof kitSchema>): Promise<KitResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new KitError("Campaign not found.");

  const owner = await prisma.campaign.findUnique({ where: { slugPrefix: input.slugPrefix }, select: { id: true, label: true, name: true } });
  if (owner && owner.id !== campaign.id) {
    throw new KitError(`Project code «${input.slugPrefix}» is already used by «${owner.label || owner.name}». Pick another one.`);
  }

  return prisma.$transaction(async (tx) => {
    if (campaign.slugPrefix !== input.slugPrefix) {
      await tx.campaign.update({ where: { id: campaign.id }, data: { slugPrefix: input.slugPrefix } });
    }
    const [links, slugs] = await Promise.all([
      tx.trackingLink.findMany({
        where: campaignLinksWhere(campaign),
        select: { slug: true, utmSource: true, utmMedium: true, utmContent: true },
      }),
      tx.trackingLink.findMany({ where: { slug: { startsWith: input.slugPrefix } }, select: { slug: true } }),
    ]);
    const plan = planKit(input.slugPrefix, input.rows as KitRow[], links, slugs.map((s) => s.slug));
    const rows = plan.map((r) => ({ ...r, destinationUrl: r.destinationUrl || input.destinationUrl }));
    const label = campaign.label || campaign.name;
    const fresh = rows.filter((r) => r.status === "new");
    const res = await tx.trackingLink.createMany({
      data: fresh.map((r) => ({
        name: `${label} — ${[r.source, r.content || r.medium].filter(Boolean).join(" · ")}`.slice(0, 120),
        slug: r.slug,
        destinationUrl: r.destinationUrl,
        campaignId: campaign.id,
        utmSource: r.source || null,
        utmMedium: r.medium || null,
        utmCampaign: campaign.name,
        utmContent: r.content || null,
      })),
      skipDuplicates: true,
    });
    if (res.count !== fresh.length) throw new KitError("Some links changed while saving. Reload the page and try again.");
    return { rows, created: res.count };
  });
}
