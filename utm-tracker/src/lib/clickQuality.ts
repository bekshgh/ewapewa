import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TIME_ZONE } from "@/lib/utils";

/**
 * Where a link's clicks come from, to tell people from ads' junk traffic and scripts:
 * by hour, app / browser, referrer, place, and how often one device clicks again.
 * Aggregates only: no IP (it is stored hashed) and no single visitor is shown.
 */

export interface Bucket { key: string; n: number }

export interface ClickQuality {
  clicks: number;
  devices: number;
  ips: number;
  leads: number;
  first: Date | null;
  last: Date | null;
  last24h: number;
  /** 0..23, Almaty time */
  byHour: number[];
  byDay: Bucket[];
  apps: Bucket[];
  os: Bucket[];
  devicesByType: Bucket[];
  referrers: Bucket[];
  places: Bucket[];
  /** How many devices clicked once, twice, 3–5 times… and how many clicks they made. */
  repeats: { bucket: string; devices: number; clicks: number }[];
  /** The busiest devices: clicks, span and what they are (no IP). */
  topDevices: { clicks: number; first: Date; last: Date; app: string; os: string | null; place: string | null }[];
}

const DEVICE = Prisma.sql`COALESCE("ipHash", "id") || '|' || COALESCE("userAgent", '')`;
// in-app browsers first: they say which app the ad or post was opened in
const APP = Prisma.sql`CASE
  WHEN "userAgent" ~* 'Instagram' THEN 'Instagram app'
  WHEN "userAgent" ~* 'FBAN|FBAV|FB_IAB|FBIOS' THEN 'Facebook app'
  WHEN "userAgent" ~* 'Telegram' THEN 'Telegram app'
  WHEN "userAgent" ~* 'BytedanceWebview|musical_ly|TikTok' THEN 'TikTok app'
  WHEN "userAgent" ~* 'Threads' THEN 'Threads app'
  WHEN "userAgent" ~* 'WhatsApp' THEN 'WhatsApp'
  WHEN "userAgent" ~* 'LinkedInApp' THEN 'LinkedIn app'
  ELSE COALESCE("browser", 'Unknown') END`;
const LOCAL = Prisma.sql`(("timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${TIME_ZONE})`;

const buckets = (rows: { k: string | null; n: bigint }[]): Bucket[] => rows.map((r) => ({ key: r.k ?? "", n: Number(r.n) }));

export async function clickQuality(linkId: string): Promise<ClickQuality> {
  const where = Prisma.sql`"trackingLinkId" = ${linkId}`;
  const top = (expr: Prisma.Sql, limit = 12) =>
    prisma.$queryRaw<{ k: string | null; n: bigint }[]>(Prisma.sql`
      SELECT ${expr} AS k, COUNT(*) AS n FROM "ClickEvent" WHERE ${where} GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`).then(buckets);

  const [totals, hours, days, apps, os, types, referrers, places, repeats, topDevices, leads] = await Promise.all([
    prisma.$queryRaw<{ clicks: bigint; devices: bigint; ips: bigint; first: Date | null; last: Date | null; day: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS clicks, COUNT(DISTINCT ${DEVICE}) AS devices, COUNT(DISTINCT "ipHash") AS ips,
             MIN("timestamp") AS first, MAX("timestamp") AS last,
             COUNT(*) FILTER (WHERE ("timestamp" AT TIME ZONE 'UTC') >= now() - interval '24 hours') AS day
      FROM "ClickEvent" WHERE ${where}`),
    prisma.$queryRaw<{ h: number; n: bigint }[]>(Prisma.sql`
      SELECT EXTRACT(HOUR FROM ${LOCAL})::int AS h, COUNT(*) AS n FROM "ClickEvent" WHERE ${where} GROUP BY 1`),
    prisma.$queryRaw<{ k: string; n: bigint }[]>(Prisma.sql`
      SELECT to_char(${LOCAL}, 'YYYY-MM-DD') AS k, COUNT(*) AS n FROM "ClickEvent" WHERE ${where} GROUP BY 1 ORDER BY 1`).then(buckets),
    top(APP),
    top(Prisma.sql`"os"`, 8),
    top(Prisma.sql`"device"`, 5),
    top(Prisma.sql`COALESCE(substring("referrer" from '^[a-zA-Z]+://([^/?#]+)'), '')`),
    top(Prisma.sql`COALESCE("city", '') || CASE WHEN "country" IS NULL THEN '' ELSE ', ' || "country" END`),
    prisma.$queryRaw<{ bucket: string; devices: bigint; clicks: bigint }[]>(Prisma.sql`
      SELECT CASE WHEN n = 1 THEN '1' WHEN n = 2 THEN '2' WHEN n <= 5 THEN '3–5' WHEN n <= 20 THEN '6–20' WHEN n <= 100 THEN '21–100' ELSE '100+' END AS bucket,
             COUNT(*) AS devices, SUM(n) AS clicks
      FROM (SELECT ${DEVICE} AS d, COUNT(*) AS n FROM "ClickEvent" WHERE ${where} GROUP BY 1) per
      GROUP BY 1 ORDER BY MIN(n)`),
    prisma.$queryRaw<{ clicks: bigint; first: Date; last: Date; app: string; os: string | null; place: string | null }[]>(Prisma.sql`
      SELECT COUNT(*) AS clicks, MIN("timestamp") AS first, MAX("timestamp") AS last, MIN(${APP}) AS app, MIN("os") AS os,
             MIN(COALESCE("city", '') || CASE WHEN "country" IS NULL THEN '' ELSE ', ' || "country" END) AS place
      FROM "ClickEvent" WHERE ${where} GROUP BY ${DEVICE} ORDER BY 1 DESC LIMIT 8`),
    prisma.lead.count({ where: { trackingLinkId: linkId } }),
  ]);

  const t = totals[0];
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const h of hours) byHour[h.h] = Number(h.n);
  return {
    clicks: Number(t?.clicks ?? 0),
    devices: Number(t?.devices ?? 0),
    ips: Number(t?.ips ?? 0),
    leads,
    first: t?.first ?? null,
    last: t?.last ?? null,
    last24h: Number(t?.day ?? 0),
    byHour,
    byDay: days,
    apps, os, devicesByType: types, referrers, places,
    repeats: repeats.map((r) => ({ bucket: r.bucket, devices: Number(r.devices), clicks: Number(r.clicks) })),
    topDevices: topDevices.map((d) => ({ ...d, clicks: Number(d.clicks) })),
  };
}
