import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { RangeTabs } from "@/components/ui/RangeTabs";
import { Pill } from "@/components/ui/Pill";
import { ClicksLeadsChart, Funnel, BreakdownPanel } from "@/components/charts/Charts";
import {
  getOverview,
  getTimeSeries,
  getBySource,
  getByCampaign,
  getByContent,
  getRecentClicks,
  getRecentLeads,
  type RangeKey,
} from "@/lib/analytics";
import { formatNumber, formatPercent, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function pickRange(v?: string): RangeKey {
  return v === "7d" || v === "90d" || v === "all" ? v : "30d";
}

export default async function DashboardPage(props: {
  searchParams: Promise<{ range?: string }>;
}) {
  const searchParams = await props.searchParams;
  const range = pickRange(searchParams.range);

  const [overview, series, bySource, byCampaign, byContent, recentClicks, recentLeads] = await Promise.all([
    getOverview(range),
    getTimeSeries(range),
    getBySource(range),
    getByCampaign(range),
    getByContent(range),
    getRecentClicks(10),
    getRecentLeads(10),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb="Dashboard"
        title="Conversion overview"
        subtitle="Clicks, leads and conversion across all your campaigns."
        action={<RangeTabs current={range} />}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total clicks"    value={formatNumber(overview.totalClicks)}     sub="all recorded clicks" accent="clicks" />
        <StatCard label="Unique clicks"   value={formatNumber(overview.uniqueClicks)}    sub="one per device / IP" accent="clicks" />
        <StatCard label="Total leads"     value={formatNumber(overview.totalLeads)}      sub="form submissions"    accent="leads"  />
        <StatCard label="Conversion rate" value={formatPercent(overview.conversionRate)} sub="unique clicks → leads"      accent="accent" />
      </section>

      <section className="mt-6 card p-6">
        <h2 className="font-display text-lg font-semibold">Clicks &amp; leads over time</h2>
        <div className="mt-4">
          <ClicksLeadsChart data={series} />
        </div>
      </section>

      <section className="mt-6 card p-6">
        <h2 className="font-display text-lg font-semibold">Conversion funnel</h2>
        <div className="mt-5">
          <Funnel clicks={overview.uniqueClicks} leads={overview.totalLeads} cr={overview.conversionRate} />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <BreakdownPanel title="By source"   head="Source"   rows={bySource}   />
        <BreakdownPanel title="By campaign" head="Campaign" rows={byCampaign} />
      </section>

      <section className="mt-6">
        <BreakdownPanel title="By content" head="Content" rows={byContent} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold">Recent clicks</h2>
          <div className="mt-4 divide-y divide-line">
            {recentClicks.length === 0 && <p className="py-6 text-sm text-ink-faint">No clicks yet.</p>}
            {recentClicks.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-ink">/r/{c.trackingLink.slug}</p>
                  <p className="text-xs text-ink-faint">
                    {c.trackingLink.utmSource || "direct"}
                    {c.country ? ` · ${c.country}` : ""}
                  </p>
                </div>
                <span className="text-xs text-ink-faint">{formatDateTime(c.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold">Recent leads</h2>
          <div className="mt-4 divide-y divide-line">
            {recentLeads.length === 0 && <p className="py-6 text-sm text-ink-faint">No leads yet.</p>}
            {recentLeads.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="flex items-center gap-2 text-sm text-ink">
                    {l.name || "Unnamed lead"}
                    <Pill label={l.attributionStatus} tone={l.attributionStatus} />
                  </p>
                  <p className="text-xs text-ink-faint">
                    {l.email || l.phone || "—"}
                    {l.utmSource ? ` · ${l.utmSource}` : ""}
                  </p>
                </div>
                <span className="text-xs text-ink-faint">{formatDateTime(l.submittedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
