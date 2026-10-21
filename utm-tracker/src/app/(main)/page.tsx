import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { RangeTabs } from "@/components/ui/RangeTabs";
import { Pill } from "@/components/ui/Pill";
import Link from "next/link";
import { ClicksLeadsChart, BreakdownPanel } from "@/components/charts/Charts";
import {
  getOverview,
  getTimeSeries,
  getBySource,
  getByCampaign,
  getRecentClicks,
  getRecentLeads,
  type RangeKey,
} from "@/lib/analytics";
import { formatNumber, formatPercent, formatDateTime } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

function pickRange(v?: string): RangeKey {
  // All time by default: projects run for weeks, a 30-day window hides finished ones.
  return v === "7d" || v === "30d" || v === "90d" ? v : "all";
}

export default async function DashboardPage(props: {
  searchParams: Promise<{ range?: string }>;
}) {
  const searchParams = await props.searchParams;
  const range = pickRange(searchParams.range);
  const t = await getT();

  const [overview, series, bySource, byCampaign, recentClicks, recentLeads] = await Promise.all([
    getOverview(range),
    getTimeSeries(range),
    getBySource(range),
    getByCampaign(range),
    getRecentClicks(10),
    getRecentLeads(10),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={t("Dashboard")}
        title={t("Conversion overview")}
        subtitle={t("Clicks, leads and conversion across all your campaigns.")}
        action={<RangeTabs current={range} />}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("Total clicks")}    value={formatNumber(overview.totalClicks)}     sub={t("all recorded clicks")} accent="clicks" />
        <StatCard label={t("Unique clicks")}   value={formatNumber(overview.uniqueClicks)}    sub={t("devices in the period")} accent="clicks" />
        <StatCard label={t("Total leads")}     value={formatNumber(overview.totalLeads)}      sub={t("form submissions")}    accent="leads"  />
        <StatCard label={t("Conversion rate")} value={formatPercent(overview.conversionRate)} sub={t("unique clicks → leads")}      accent="accent" />
      </section>

      <section className="mt-6 card p-6">
        <h2 className="font-display text-lg font-semibold">{t("Clicks & leads over time")}</h2>
        <div className="mt-4">
          <ClicksLeadsChart data={series} />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <BreakdownPanel title={t("By source")}   head={t("Source")}   rows={bySource}   />
        <BreakdownPanel title={t("By campaign")} head={t("Campaign")} rows={byCampaign} />
      </section>

      <p className="mt-3 text-right text-sm">
        <Link href={`/analytics${range === "all" ? "" : `?range=${range}`}`} className="text-accent hover:underline">{t("Content and per-link tables → Analytics")}</Link>
      </p>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold">{t("Recent clicks")}</h2>
          <div className="mt-4 divide-y divide-line">
            {recentClicks.length === 0 && <p className="py-6 text-sm text-ink-faint">{t("No clicks yet.")}</p>}
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
          <h2 className="font-display text-lg font-semibold">{t("Recent leads")}</h2>
          <div className="mt-4 divide-y divide-line">
            {recentLeads.length === 0 && <p className="py-6 text-sm text-ink-faint">{t("No leads yet.")}</p>}
            {recentLeads.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="flex items-center gap-2 text-sm text-ink">
                    {l.name || t("Unnamed lead")}
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
