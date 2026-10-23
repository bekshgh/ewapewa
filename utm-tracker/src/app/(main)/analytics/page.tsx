import { PageHeader } from "@/components/ui/PageHeader";
import { RangeTabs } from "@/components/ui/RangeTabs";
import { getBySource, getByCampaign, getByContent, getLinkStats, type RangeKey } from "@/lib/analytics";
import { formatNumber, formatPercent } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function pickRange(v?: string): RangeKey {
  // All time by default: projects run for weeks, a 30-day window hides finished ones.
  return v === "7d" || v === "30d" || v === "90d" ? v : "all";
}

export default async function AnalyticsPage(props: { searchParams: Promise<{ range?: string }> }) {
  const searchParams = await props.searchParams;
  const range = pickRange(searchParams.range);
  const t = await getT();
  const [bySource, byCampaign, byContent, links] = await Promise.all([
    getBySource(range), getByCampaign(range), getByContent(range), getLinkStats(range),
  ]);

  return (
    <>
      <PageHeader breadcrumb={t("Analytics")} title={t("Analytics")} subtitle={t("Performance by source, campaign, content and link.")} action={<RangeTabs current={range} />} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown t={t} title={t("By source")} head={t("Source")} rows={bySource} />
        <Breakdown t={t} title={t("By campaign")} head={t("Campaign")} rows={byCampaign} />
      </div>

      <div className="mt-6">
        <Breakdown t={t} title={t("By content / placement")} head={t("Content")} rows={byContent} showPct />
      </div>

      <div className="mt-6 card overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold">{t("Conversion rate by link")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-6 py-3 font-medium">{t("Link")}</th>
                <th className="px-6 py-3 font-medium">{t("Source / content")}</th>
                <th className="px-6 py-3 text-right font-medium">{t("Clicks")}</th>
                <th className="px-6 py-3 text-right font-medium">{t("Leads")}</th>
                <th className="px-6 py-3 text-right font-medium">CR%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {links.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-ink-faint">{t("No data yet.")}</td></tr>}
              {links.map((l) => (
                <tr key={l.id} className="hover:bg-bg-hover/40">
                  <td className="px-6 py-3 text-ink">/r/{l.slug}</td>
                  <td className="px-6 py-3 text-ink-muted">{l.utmSource || "—"} · {l.utmContent || "—"}</td>
                  <td className="num px-6 py-3 text-right text-ink">{formatNumber(l.clicks)}</td>
                  <td className="num px-6 py-3 text-right text-leads">{formatNumber(l.leads)}</td>
                  <td className="num px-6 py-3 text-right text-ink">{l.clicks ? formatPercent(l.cr) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Breakdown({ title, head, rows, showPct, t }: { title: string; head: string; rows: { key: string; clicks: number; leads: number; cr: number }[]; showPct?: boolean; t: T }) {
  const totalLeads = rows.reduce((s, r) => s + r.leads, 0) || 1;
  return (
    <div className="card p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-faint">
            <th className="pb-2 font-medium">{head}</th>
            <th className="pb-2 text-right font-medium">{t("Clicks")}</th>
            <th className="pb-2 text-right font-medium">{t("Leads")}</th>
            <th className="pb-2 text-right font-medium">{showPct ? t("% leads") : "CR%"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-ink-faint">{t("No data yet.")}</td></tr>}
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2.5 text-ink">{r.key}</td>
              <td className="num py-2.5 text-right text-ink-muted">{formatNumber(r.clicks)}</td>
              <td className="num py-2.5 text-right text-leads">{formatNumber(r.leads)}</td>
              <td className="num py-2.5 text-right text-ink">
                {showPct ? formatPercent((r.leads / totalLeads) * 100) : r.clicks ? formatPercent(r.cr) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
