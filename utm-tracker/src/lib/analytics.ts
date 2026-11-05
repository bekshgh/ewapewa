import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TIME_ZONE, conversionRate, localDay } from "@/lib/utils";

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

/**
 * Clicks and unique clicks of every link in the period, in one pass over the clicks.
 * The dashboard and Analytics need them several times per page: computed once per request.
 */
export const clickTotalsByLink = cache(async (range: RangeKey): Promise<Map<string, { clicks: number; unique: number }>> => {
  const since = rangeToDate(range);
  const rows = await prisma.$queryRaw<{ id: string; clicks: bigint; n: bigint }[]>(Prisma.sql`
    SELECT "trackingLinkId" AS id, COUNT(*) AS clicks,
           COUNT(DISTINCT COALESCE("ipHash", "id") || '|' || COALESCE("userAgent", '')) AS n
    FROM "ClickEvent" WHERE ${since ? Prisma.sql`("timestamp" AT TIME ZONE 'UTC') >= ${since}` : Prisma.sql`TRUE`} GROUP BY 1`);
  return new Map(rows.map((r) => [r.id, { clicks: Number(r.clicks), unique: Number(r.n) }]));
});

export async function getOverview(range: RangeKey) {
  const since = rangeToDate(range);
  const leadWhere = since ? { submittedAt: { gte: since } } : {};

  const [byLink, totalLeads, activeCampaigns] = await Promise.all([
    clickTotalsByLink(range),
    prisma.lead.count({ where: leadWhere }),
    prisma.campaign.count({ where: { status: "active" } }),
  ]);
  let totalClicks = 0, uniqueClicks = 0;
  for (const v of byLink.values()) { totalClicks += v.clicks; uniqueClicks += v.unique; }

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

/** Clicks or leads per day in the team's time zone, counted by the database. */
async function perDay(table: "ClickEvent" | "Lead", column: "timestamp" | "submittedAt", since: Date) {
  // the columns hold UTC without a time zone: read them as UTC, then as Almaty wall-clock time
  const rows = await prisma.$queryRaw<{ d: string; n: bigint }[]>(Prisma.sql`
    SELECT to_char((${Prisma.raw(`"${column}"`)} AT TIME ZONE 'UTC') AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM-DD') AS d, COUNT(*) AS n
    FROM ${Prisma.raw(`"${table}"`)} WHERE (${Prisma.raw(`"${column}"`)} AT TIME ZONE 'UTC') >= ${since} GROUP BY 1`);
  return rows.map((r) => ({ day: r.d, n: Number(r.n) }));
}

export async function getTimeSeries(range: RangeKey) {
  const since = rangeToDate(range) ?? (await firstActivity());
  const [clicks, leads] = await Promise.all([perDay("ClickEvent", "timestamp", since), perDay("Lead", "submittedAt", since)]);

  const map = new Map<string, { date: string; clicks: number; leads: number }>();
  // seed every day in range so the chart has no gaps (days in the team's time zone)
  for (let t = since.getTime(); t <= Date.now(); t += 86_400_000) {
    const k = localDay(new Date(t));
    map.set(k, { date: k, clicks: 0, leads: 0 });
  }
  const row = (k: string) => map.get(k) ?? map.set(k, { date: k, clicks: 0, leads: 0 }).get(k)!;
  for (const c of clicks) row(c.day).clicks += c.n;
  for (const l of leads) row(l.day).leads += l.n;
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
  const [links, totals, leadGroups] = await Promise.all([
    prisma.trackingLink.findMany({ select: { id: true, utmSource: true, utmCampaign: true, utmContent: true } }),
    clickTotalsByLink(range),
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
    r.clicks += totals.get(l.id)?.clicks ?? 0;
    r.uniqueClicks += totals.get(l.id)?.unique ?? 0;
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
  const [links, totals] = await Promise.all([prisma.trackingLink.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: "desc" },
    include: {
      campaign: { select: { name: true, label: true } },
      _count: { select: { leads: since ? { where: { submittedAt: { gte: since } } } : true } },
    },
  }), clickTotalsByLink(range)]);
  return links.map((l) => {
    const c = totals.get(l.id);
    return {
      ...l,
      clicks: c?.clicks ?? 0,
      uniqueClicks: c?.unique ?? 0,
      leads: l._count.leads,
      cr: conversionRate(l._count.leads, c?.unique ?? 0),
    };
  });
}

export async function getWebhookHealth() {
  const [last, totals] = await Promise.all([
    prisma.webhookLog.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.webhookLog.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { last, totals };
}
