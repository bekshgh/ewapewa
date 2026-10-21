import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conversionRate, localDay } from "@/lib/utils";

export type RangeKey = "7d" | "30d" | "90d" | "all";

export function rangeToDate(range: RangeKey): Date | null {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
  if (days === null) return null;
  return new Date(Date.now() - days * 86_400_000);
}

/**
 * Unique clicks per link: distinct devices (IP hash + browser) that clicked it
 * within the period. A campus Wi-Fi or a mobile operator puts many people
 * behind one IP, so the IP alone undercounts them; and someone coming back next
 * week counts again in next week's numbers. Conversion rates everywhere are
 * leads ÷ unique clicks, so repeat taps by the same person do not dilute them.
 */
export async function uniqueClicksByLink(since: Date | null, linkIds?: string[]): Promise<Map<string, number>> {
  if (linkIds && linkIds.length === 0) return new Map();
  const where = [Prisma.sql`TRUE`];
  // the column holds UTC without a time zone: compare it as UTC
  if (since) where.push(Prisma.sql`("timestamp" AT TIME ZONE 'UTC') >= ${since}`);
  if (linkIds) where.push(Prisma.sql`"trackingLinkId" IN (${Prisma.join(linkIds)})`);
  const rows = await prisma.$queryRaw<{ id: string; n: bigint }[]>(Prisma.sql`
    SELECT "trackingLinkId" AS id, COUNT(DISTINCT COALESCE("ipHash", "id") || '|' || COALESCE("userAgent", '')) AS n
    FROM "ClickEvent" WHERE ${Prisma.join(where, " AND ")} GROUP BY 1`);
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

export async function getOverview(range: RangeKey) {
  const since = rangeToDate(range);
  const clickWhere = since ? { timestamp: { gte: since } } : {};
  const leadWhere = since ? { submittedAt: { gte: since } } : {};

  const [totalClicks, uniqueByLink, totalLeads, activeCampaigns] = await Promise.all([
    prisma.clickEvent.count({ where: clickWhere }),
    uniqueClicksByLink(since),
    prisma.lead.count({ where: leadWhere }),
    prisma.campaign.count({ where: { status: "active" } }),
  ]);
  const uniqueClicks = [...uniqueByLink.values()].reduce((a, b) => a + b, 0);

  return {
    totalClicks,
    uniqueClicks,
    totalLeads,
    activeCampaigns,
    conversionRate: conversionRate(totalLeads, uniqueClicks),
  };
}

/** Daily clicks & leads series for the line chart. */
/** "All time" chart start: the first click or lead, at most a year back (30 days when there is nothing yet). */
async function firstActivity(): Promise<Date> {
  const [c, l] = await Promise.all([
    prisma.clickEvent.aggregate({ _min: { timestamp: true } }),
    prisma.lead.aggregate({ _min: { submittedAt: true } }),
  ]);
  const yearAgo = Date.now() - 366 * 86_400_000;
  const first = Math.min(c._min.timestamp?.getTime() ?? Infinity, l._min.submittedAt?.getTime() ?? Infinity);
  if (!Number.isFinite(first)) return new Date(Date.now() - 30 * 86_400_000);
  const d = new Date(Math.max(first, yearAgo));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getTimeSeries(range: RangeKey) {
  const since = rangeToDate(range) ?? (await firstActivity());
  const [clicks, leads] = await Promise.all([
    prisma.clickEvent.findMany({
      where: { timestamp: { gte: since } },
      select: { timestamp: true },
    }),
    prisma.lead.findMany({
      where: { submittedAt: { gte: since } },
      select: { submittedAt: true },
    }),
  ]);

  const map = new Map<string, { date: string; clicks: number; leads: number }>();
  // days in the team's time zone: a click at 02:00 in Almaty belongs to that day, not the one before
  const dayKey = (d: Date) => localDay(d);

  // seed every day in range so the chart has no gaps
  const start = new Date(since);
  for (let t = start.getTime(); t <= Date.now(); t += 86_400_000) {
    const k = dayKey(new Date(t));
    map.set(k, { date: k, clicks: 0, leads: 0 });
  }
  for (const c of clicks) {
    const k = dayKey(c.timestamp);
    const row = map.get(k) ?? { date: k, clicks: 0, leads: 0 };
    row.clicks++;
    map.set(k, row);
  }
  for (const l of leads) {
    const k = dayKey(l.submittedAt);
    const row = map.get(k) ?? { date: k, clicks: 0, leads: 0 };
    row.leads++;
    map.set(k, row);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

interface Breakdown {
  key: string;
  clicks: number;
  uniqueClicks: number;
  leads: number;
  /** leads ÷ unique clicks, % */
  cr: number;
}

/**
 * Clicks and leads land in the same row: a lead that came through a tracker
 * link counts under that link's UTM, like the link's clicks (its own copy of
 * the tags may be stale or mixed). Leads not tied to a link (direct,
 * imported, a page with UTM only) count under their own UTM.
 */
async function breakdownBy(field: "utmSource" | "utmCampaign" | "utmContent", range: RangeKey) {
  const since = rangeToDate(range);
  const [links, unique, leadGroups] = await Promise.all([
    prisma.trackingLink.findMany({
      select: {
        id: true,
        utmSource: true,
        utmCampaign: true,
        utmContent: true,
        _count: { select: { clicks: since ? { where: { timestamp: { gte: since } } } : true } },
      },
    }),
    uniqueClicksByLink(since),
    prisma.lead.groupBy({
      by: [field, "trackingLinkId"],
      where: since ? { submittedAt: { gte: since } } : {},
      _count: { _all: true },
    }),
  ]);

  const agg = new Map<string, { clicks: number; uniqueClicks: number; leads: number }>();
  const row = (k: string | null | undefined) => {
    const key = k || "(none)";
    const r = agg.get(key) ?? { clicks: 0, uniqueClicks: 0, leads: 0 };
    agg.set(key, r);
    return r;
  };
  const linkValue = new Map<string, string | null>();
  for (const l of links) {
    linkValue.set(l.id, l[field]);
    const r = row(l[field]);
    r.clicks += l._count.clicks;
    r.uniqueClicks += unique.get(l.id) ?? 0;
  }
  for (const g of leadGroups) {
    const own = g[field] as string | null;
    row(g.trackingLinkId && linkValue.has(g.trackingLinkId) ? linkValue.get(g.trackingLinkId) : own).leads += g._count._all;
  }

  return Array.from(agg.entries())
    .map(([key, v]): Breakdown => ({ key, ...v, cr: conversionRate(v.leads, v.uniqueClicks) }))
    .sort((a, b) => b.clicks - a.clicks || b.leads - a.leads);
}

export const getBySource = (r: RangeKey) => breakdownBy("utmSource", r);
export const getByCampaign = (r: RangeKey) => breakdownBy("utmCampaign", r);
export const getByContent = (r: RangeKey) => breakdownBy("utmContent", r);

export async function getRecentClicks(limit = 10) {
  return prisma.clickEvent.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
    include: { trackingLink: { select: { slug: true, utmSource: true } } },
  });
}

export async function getRecentLeads(limit = 10) {
  return prisma.lead.findMany({
    orderBy: { submittedAt: "desc" },
    take: limit,
  });
}

export async function getLinkStats(range: RangeKey) {
  const since = rangeToDate(range);
  const [links, unique] = await Promise.all([prisma.trackingLink.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: "desc" },
    include: {
      campaign: { select: { name: true, label: true } },
      _count: {
        select: {
          clicks: since ? { where: { timestamp: { gte: since } } } : true,
          leads: since ? { where: { submittedAt: { gte: since } } } : true,
        },
      },
    },
  }), uniqueClicksByLink(since)]);
  return links.map((l) => ({
    ...l,
    clicks: l._count.clicks,
    uniqueClicks: unique.get(l.id) ?? 0,
    leads: l._count.leads,
    cr: conversionRate(l._count.leads, unique.get(l.id) ?? 0),
  }));
}

export async function getWebhookHealth() {
  const [last, totals] = await Promise.all([
    prisma.webhookLog.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.webhookLog.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { last, totals };
}
