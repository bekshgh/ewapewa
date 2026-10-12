import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { BreakdownPanel } from "@/components/charts/Charts";
import { CampaignActions } from "@/components/CampaignActions";
import { formatNumber, formatPercent, conversionRate } from "@/lib/utils";
import { uniqueClicksByLink } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) notFound();

  const links = await prisma.trackingLink.findMany({
    where: { utmCampaign: campaign.name },
    select: { id: true, utmSource: true, utmContent: true },
  });
  const linkIds = links.map((l) => l.id);

  const [allByLink, uniqueByLink, totalLeads, srcLeads, cntLeads] = await Promise.all([
    prisma.clickEvent.groupBy({ by: ["trackingLinkId"], where: { trackingLinkId: { in: linkIds } }, _count: { _all: true } }),
    uniqueClicksByLink(null, linkIds),
    prisma.lead.count({ where: { utmCampaign: campaign.name } }),
    prisma.lead.groupBy({ by: ["utmSource"], where: { utmCampaign: campaign.name }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["utmContent"], where: { utmCampaign: campaign.name }, _count: { _all: true } }),
  ]);
  const clicksOf = new Map(allByLink.map((r) => [r.trackingLinkId, r._count._all]));
  const totalClicks = allByLink.reduce((n, r) => n + r._count._all, 0);
  const uniqueClicks = Array.from(uniqueByLink.values()).reduce((n, v) => n + v, 0);

  // Conversion is leads ÷ unique clicks (see uniqueClicksByLink).
  const cr = conversionRate(totalLeads, uniqueClicks);

  function breakdown(keyOf: (l: (typeof links)[number]) => string | null, leadRows: { key: string | null; n: number }[]) {
    const map = new Map<string, { clicks: number; uniqueClicks: number; leads: number }>();
    const row = (k: string | null) => {
      const key = k || "(none)";
      const r = map.get(key) ?? { clicks: 0, uniqueClicks: 0, leads: 0 };
      map.set(key, r);
      return r;
    };
    for (const l of links) {
      const r = row(keyOf(l));
      r.clicks += clicksOf.get(l.id) ?? 0;
      r.uniqueClicks += uniqueByLink.get(l.id) ?? 0;
    }
    for (const x of leadRows) row(x.key).leads += x.n;
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, cr: conversionRate(v.leads, v.uniqueClicks) }))
      .sort((a, b) => b.clicks - a.clicks);
  }
  const bySource = breakdown((l) => l.utmSource, srcLeads.map((r) => ({ key: r.utmSource, n: r._count._all })));
  const byContent = breakdown((l) => l.utmContent, cntLeads.map((r) => ({ key: r.utmContent, n: r._count._all })));

  return (
    <>
      <PageHeader
        breadcrumb="Campaigns"
        title={campaign.label || campaign.name}
        subtitle={[campaign.type, campaign.season, `utm: ${campaign.name}`].filter(Boolean).join(" · ")}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/campaigns/${campaign.id}/utm-links`} className="btn-primary text-sm">Create UTM links</Link>
            <CampaignActions id={campaign.id} status={campaign.status} />
          </div>
        }
      />
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        <StatCard label="Total clicks"    value={formatNumber(totalClicks)}  sub="all recorded"     accent="clicks" />
        <StatCard label="Unique clicks"   value={formatNumber(uniqueClicks)} sub="per device / IP"  accent="clicks" />
        <StatCard label="Leads"           value={formatNumber(totalLeads)}   sub="form submissions" accent="leads"  />
        <StatCard label="Conversion rate" value={formatPercent(cr)}          sub="unique clicks → leads" accent="accent" />
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <BreakdownPanel title="By source"  head="Source"  rows={bySource}  />
        <BreakdownPanel title="By content" head="Content" rows={byContent} />
      </section>
    </>
  );
}
