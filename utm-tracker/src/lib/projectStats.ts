import { prisma } from "@/lib/db";
import { uniqueClicksByLink } from "@/lib/analytics";
import { conversionRate } from "@/lib/utils";
import { groupCampaigns, personKeys, type CampaignRole, type ProjectGroup } from "@/lib/projectGroups";

const campaignFields = { id: true, name: true, label: true, status: true, createdAt: true } as const;
type CampaignRow = { id: string; name: string; label: string | null; status: string; createdAt: Date };

export async function allProjectGroups(): Promise<ProjectGroup<CampaignRow>[]> {
  const campaigns = await prisma.campaign.findMany({ select: campaignFields, orderBy: { createdAt: "desc" } });
  return groupCampaigns(campaigns);
}

export interface CampaignStats {
  id: string;
  name: string;
  label: string | null;
  role: CampaignRole;
  links: number;
  clicks: number;
  uniqueClicks: number;
  leads: number;
  /** leads ÷ unique clicks, % */
  cr: number;
  /** Programme campaigns: leads ÷ the project's registrations, % (null when the project has none). */
  ofProject: number | null;
  /** Programme campaigns: how many of the project's registrants also applied here (same e-mail or phone). */
  fromProject: number | null;
}

export interface ChannelRow {
  key: string;
  uniqueClicks: number;
  /** Leads per campaign id. */
  leads: Record<string, number>;
}

export interface ProjectStats {
  group: ProjectGroup<CampaignRow>;
  campaigns: CampaignStats[];
  projectCampaignIds: string[];
  programmeCampaignIds: string[];
  totals: { clicks: number; uniqueClicks: number; projectRegs: number; programmeRegs: number };
  bySource: ChannelRow[];
  byContent: ChannelRow[];
}

/** Everything the project folder shows, for every campaign in it. */
export async function projectStats(key: string): Promise<ProjectStats | null> {
  const group = (await allProjectGroups()).find((g) => g.key === key);
  if (!group) return null;

  const ids = group.campaigns.map((c) => c.id);
  const names = group.campaigns.map((c) => c.name);
  const byName = new Map(group.campaigns.map((c) => [c.name, c.id]));

  const links = await prisma.trackingLink.findMany({
    where: { OR: [{ utmCampaign: { in: names } }, { campaignId: { in: ids } }] },
    select: { id: true, campaignId: true, utmCampaign: true, utmSource: true, utmContent: true },
  });
  const linkIds = links.map((l) => l.id);
  const [allClicks, unique, leads] = await Promise.all([
    prisma.clickEvent.groupBy({ by: ["trackingLinkId"], where: { trackingLinkId: { in: linkIds } }, _count: { _all: true } }),
    uniqueClicksByLink(null, linkIds),
    // A lead belongs to a campaign by its own utm_campaign, else by its link's (as on the dashboard).
    prisma.lead.findMany({
      where: {
        OR: [
          { utmCampaign: { in: names } },
          { utmCampaign: null, trackingLinkId: { in: linkIds } },
        ],
      },
      select: {
        utmCampaign: true, utmSource: true, utmContent: true, email: true, phone: true,
        trackingLink: { select: { utmCampaign: true, utmSource: true, utmContent: true, campaignId: true } },
      },
    }),
  ]);
  const clicksOf = new Map(allClicks.map((r) => [r.trackingLinkId, r._count._all]));

  const campaignOfLink = (l: { campaignId: string | null; utmCampaign: string | null }) =>
    (l.utmCampaign && byName.get(l.utmCampaign)) || (l.campaignId && ids.includes(l.campaignId) ? l.campaignId : null);

  // Per campaign: links and clicks.
  const per = new Map(ids.map((id) => [id, { links: 0, clicks: 0, uniqueClicks: 0, leads: 0, people: new Set<string>() }]));
  for (const l of links) {
    const cid = campaignOfLink(l);
    if (!cid) continue;
    const p = per.get(cid)!;
    p.links += 1;
    p.clicks += clicksOf.get(l.id) ?? 0;
    p.uniqueClicks += unique.get(l.id) ?? 0;
  }

  // Per channel: unique clicks from links, leads per campaign.
  const channels = { utmSource: new Map<string, ChannelRow>(), utmContent: new Map<string, ChannelRow>() };
  const channel = (field: keyof typeof channels, v: string | null | undefined) => {
    const key = v || "(none)";
    const m = channels[field];
    const r = m.get(key) ?? { key, uniqueClicks: 0, leads: {} };
    m.set(key, r);
    return r;
  };
  for (const l of links) {
    if (!campaignOfLink(l)) continue;
    const u = unique.get(l.id) ?? 0;
    channel("utmSource", l.utmSource).uniqueClicks += u;
    channel("utmContent", l.utmContent).uniqueClicks += u;
  }
  const owned = leads.flatMap((lead) => {
    const cid = (lead.utmCampaign && byName.get(lead.utmCampaign)) || (lead.trackingLink && campaignOfLink(lead.trackingLink));
    return cid ? [{ ...lead, cid }] : [];
  });
  for (const lead of owned) {
    const { cid } = lead;
    const p = per.get(cid)!;
    p.leads += 1;
    for (const k of personKeys(lead)) p.people.add(k);
    for (const field of ["utmSource", "utmContent"] as const) {
      const r = channel(field, lead[field] || lead.trackingLink?.[field]);
      r.leads[cid] = (r.leads[cid] ?? 0) + 1;
    }
  }

  const projectCampaignIds = group.campaigns.filter((c) => c.role.kind === "project").map((c) => c.id);
  const programmeCampaignIds = group.campaigns.filter((c) => c.role.kind === "programme").map((c) => c.id);
  const projectRegs = projectCampaignIds.reduce((n, id) => n + per.get(id)!.leads, 0);
  const projectPeople = new Set(projectCampaignIds.flatMap((id) => [...per.get(id)!.people]));

  const campaigns: CampaignStats[] = group.campaigns.map((c) => {
    const p = per.get(c.id)!;
    const programme = c.role.kind === "programme";
    return {
      id: c.id,
      name: c.name,
      label: c.label,
      role: c.role,
      links: p.links,
      clicks: p.clicks,
      uniqueClicks: p.uniqueClicks,
      leads: p.leads,
      cr: conversionRate(p.leads, p.uniqueClicks),
      ofProject: programme && projectRegs ? conversionRate(p.leads, projectRegs) : null,
      fromProject: programme && projectPeople.size ? countShared(owned.filter((l) => l.cid === c.id), projectPeople) : null,
    };
  });

  const sortRows = (m: Map<string, ChannelRow>) =>
    [...m.values()]
      .filter((r) => r.uniqueClicks || Object.keys(r.leads).length)
      .sort((a, b) => total(b) - total(a) || b.uniqueClicks - a.uniqueClicks);

  return {
    group,
    campaigns,
    projectCampaignIds,
    programmeCampaignIds,
    totals: {
      clicks: campaigns.reduce((n, c) => n + c.clicks, 0),
      uniqueClicks: campaigns.reduce((n, c) => n + c.uniqueClicks, 0),
      projectRegs,
      programmeRegs: programmeCampaignIds.reduce((n, id) => n + per.get(id)!.leads, 0),
    },
    bySource: sortRows(channels.utmSource),
    byContent: sortRows(channels.utmContent),
  };
}

const total = (r: ChannelRow) => Object.values(r.leads).reduce((n, v) => n + v, 0);

/** People who applied to a programme (its leads) and are also among the project's registrants. */
function countShared(leads: { email: string | null; phone: string | null }[], projectPeople: Set<string>) {
  const seen = new Set<string>();
  let n = 0;
  for (const lead of leads) {
    const keys = personKeys(lead);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    if (keys.some((k) => projectPeople.has(k))) n += 1;
  }
  return n;
}
