import crypto from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * "Direct" registrations: the visitor did not come through a tracker link
 * (no click_id), e.g. found the landing in search or got a plain URL. The
 * snippet still reports them; the campaign is worked out from the page the
 * form was sent from.
 */

/** host + path, lower-case host, no trailing slash, no query: "aiesecinkz.tilda.ws/toptalentssprint". */
export function pageKey(url: string | null | undefined): { host: string; path: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return { host: u.hostname.toLowerCase().replace(/^www\./, ""), path: u.pathname.replace(/\/+$/, "").toLowerCase() };
  } catch {
    return null;
  }
}

/** "/a/b" is under "/a" and under "" (the site root); "/ab" is not under "/a". */
export function pathUnder(page: string, base: string): boolean {
  return base === "" || page === base || page.startsWith(base + "/");
}

export interface LandingLink {
  destinationUrl: string;
  campaign: string | null;
}

/**
 * The campaign whose links lead to this page: the links with the longest
 * destination path the page is on. Only when those links all belong to one
 * campaign — a page shared by several projects (a common oGX form) gets none.
 */
export function campaignForPage(pageUrl: string, links: LandingLink[]): string | null {
  const page = pageKey(pageUrl);
  if (!page) return null;
  let best = -1;
  let campaigns = new Set<string | null>();
  for (const l of links) {
    const d = pageKey(l.destinationUrl);
    if (!d || d.host !== page.host || !pathUnder(page.path, d.path)) continue;
    if (d.path.length > best) {
      best = d.path.length;
      campaigns = new Set([l.campaign]);
    } else if (d.path.length === best) campaigns.add(l.campaign);
  }
  return campaigns.size === 1 ? [...campaigns][0] : null;
}

/** Hosts the team's links point to: direct registrations are accepted only from these sites. */
export function knownHost(pageUrl: string, links: LandingLink[]): boolean {
  const page = pageKey(pageUrl);
  return !!page && links.some((l) => pageKey(l.destinationUrl)?.host === page.host);
}

export async function landingLinks(): Promise<LandingLink[]> {
  const links = await prisma.trackingLink.findMany({
    where: { isArchived: false },
    select: { destinationUrl: true, utmCampaign: true, campaign: { select: { name: true } } },
  });
  return links.map((l) => ({ destinationUrl: l.destinationUrl, campaign: l.campaign?.name ?? l.utmCampaign ?? null }));
}

export const DIRECT_PER_IP_PER_HOUR = 10;

/** How many direct leads this (hashed) IP sent in the last hour. */
export async function recentDirectFrom(ipHash: string): Promise<number> {
  return prisma.lead.count({
    where: {
      dedupeKey: { startsWith: "dr:" },
      submittedAt: { gte: new Date(Date.now() - 3_600_000) },
      sourcePayload: { path: ["_ip"], equals: ipHash },
    },
  });
}

/** One lead per page view (the snippet's sid), so the button press and Tilda's success callback merge. */
export function directDedupeKey(sid: string): string {
  return "dr:" + crypto.createHash("sha256").update(sid).digest("hex").slice(0, 32);
}
