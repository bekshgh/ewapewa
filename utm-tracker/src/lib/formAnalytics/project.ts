import { campaignForPage, knownHost, landingLinks, type LandingLink } from "@/lib/directLeads";
import { groupCampaigns, type GroupCampaign } from "@/lib/projectGroups";
import { prisma } from "@/lib/db";

/**
 * Forms found on any page by /t.js carry no project. The project is worked
 * out the same way as for direct registrations: the campaign whose tracker
 * links lead to this page, else the visitor's utm_campaign; then the project
 * folder that campaign is in. The links and campaigns are cached for a
 * minute: this runs on the public collector.
 */

let cache: { at: number; links: LandingLink[]; campaigns: GroupCampaign[] } | null = null;
const TTL = 60_000;

async function snapshot() {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const [links, campaigns] = await Promise.all([
    landingLinks(),
    prisma.campaign.findMany({ select: { id: true, name: true, label: true, createdAt: true } }),
  ]);
  cache = { at: Date.now(), links, campaigns };
  return cache;
}

/** Tests change links between cases. */
export function resetProjectCache() {
  cache = null;
}

/** The project folder key for a campaign name, e.g. "TopTalents Sprint F'26" → "toptalentssprint-f26". */
export function folderOf(campaign: string | null | undefined, campaigns: GroupCampaign[]): string | null {
  if (!campaign) return null;
  const name = campaign.trim().toLowerCase();
  const group = groupCampaigns(campaigns).find((g) => g.campaigns.some((c) => c.name.toLowerCase() === name));
  return group?.key ?? null;
}

export async function inferProject(pageUrl: string | null | undefined, utmCampaign: string | null | undefined): Promise<string | null> {
  const s = await snapshot();
  const byPage = pageUrl ? campaignForPage(pageUrl, s.links) : null;
  return folderOf(byPage, s.campaigns) ?? folderOf(utmCampaign, s.campaigns);
}

/** A site the team's tracker links lead to: its pages may send form analytics. */
export async function isTeamSite(origin: string): Promise<boolean> {
  return knownHost(origin + "/", (await snapshot()).links);
}
