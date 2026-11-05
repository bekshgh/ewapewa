import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { clickQuality, type Bucket } from "@/lib/clickQuality";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Where one link's clicks come from: people, ad traffic or a script. */
export default async function LinkClicksPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const t = await getT();
  const link = await prisma.trackingLink.findUnique({ where: { id }, select: { id: true, slug: true, name: true, utmSource: true, utmMedium: true, utmContent: true } });
  if (!link) notFound();
  const q = await clickQuality(link.id);
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

  const inApp = q.apps.filter((a) => / app$/.test(a.key)).reduce((s, a) => s + a.n, 0);
  const night = q.byHour.slice(0, 6).reduce((s, n) => s + n, 0);
  const noReferrer = q.referrers.find((r) => !r.key)?.n ?? 0;
  const perDevice = q.devices ? q.clicks / q.devices : 0;
  const heavy = q.repeats.filter((r) => ["21–100", "100+"].includes(r.bucket)).reduce((s, r) => s + r.clicks, 0);
  const notes = [
    inApp / (q.clicks || 1) > 0.5 && t("{p} of clicks open inside an app (Instagram, Facebook…): typical for ads and posts in those apps.", { p: pct(inApp, q.clicks) }),
    night / (q.clicks || 1) > 0.2 && t("{p} of clicks come between 00:00 and 06:00: much for people, typical for ads shown all night or a script.", { p: pct(night, q.clicks) }),
    perDevice > 2 && t("{n} clicks per device on average: people rarely open one link that often.", { n: perDevice.toFixed(1) }),
    heavy / (q.clicks || 1) > 0.1 && t("{p} of clicks come from devices with more than 20 clicks each: looks like a script or a page that opens the link by itself.", { p: pct(heavy, q.clicks) }),
    noReferrer / (q.clicks || 1) > 0.8 && t("{p} of clicks have no referring site: apps and ads usually send none, so this alone proves nothing.", { p: pct(noReferrer, q.clicks) }),
  ].filter(Boolean) as string[];

  const maxHour = Math.max(1, ...q.byHour);
  return (
    <>
      <PageHeader
        breadcrumb={t("Links")}
        title={t("Click quality")}
        subtitle={`/r/${link.slug} · ${[link.utmSource, link.utmMedium, link.utmContent].filter(Boolean).join(" / ")}`}
        action={<Link href="/links" className="btn-ghost">← {t("All links")}</Link>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("Clicks")} value={formatNumber(q.clicks)} note={t("{n} in the last 24 hours", { n: formatNumber(q.last24h) })} />
        <Tile label={t("Devices")} value={formatNumber(q.devices)} note={t("{n} clicks per device · {ips} networks (IP)", { n: perDevice.toFixed(1), ips: formatNumber(q.ips) })} />
        <Tile label={t("Leads")} value={formatNumber(q.leads)} tone="leads" note={t("{p} of devices registered", { p: q.devices ? `${((q.leads / q.devices) * 100).toFixed(1)}%` : "—" })} />
        <Tile label={t("Period")} value={q.first ? formatDateTime(q.first).split(",")[0] : "—"} note={q.last ? t("last click {time}", { time: formatDateTime(q.last) }) : ""} />
      </div>

      {notes.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="font-display text-base font-semibold">{t("What stands out")}</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-muted">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      )}

      <section className="card mt-6 p-5">
        <h2 className="font-display text-base font-semibold">{t("By hour (Almaty)")}</h2>
        <div className="mt-4 flex h-32 items-end gap-1">
          {q.byHour.map((n, h) => (
            <div key={h} className="flex flex-1 flex-col items-center gap-1" title={`${h}:00 — ${formatNumber(n)}`}>
              <div className="w-full rounded-t bg-accent/80" style={{ height: `${(n / maxHour) * 100}%`, minHeight: n ? 2 : 0 }} />
              <span className="text-[10px] text-ink-faint">{h % 3 === 0 ? h : ""}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Table title={t("App or browser")} rows={q.apps} total={q.clicks} label={(k) => (k === "Unknown" ? t("Unknown") : k.replace(/ app$/, ` (${t("app")})`))} />
        <Table title={t("Referring site")} rows={q.referrers} total={q.clicks} label={(k) => k || t("none (app, ad or typed)")} />
        <Table title={t("Place")} rows={q.places} total={q.clicks} label={(k) => k || t("Unknown")} />
        <Table title={t("System and device")} rows={[...q.os, ...q.devicesByType.map((d) => ({ ...d, key: `· ${d.key}` }))]} total={q.clicks} label={(k) => k || t("Unknown")} />
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-display text-base font-semibold">{t("Repeat clicks from one device")}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="pb-2 font-medium">{t("Clicks per device")}</th>
                <th className="pb-2 text-right font-medium">{t("Devices")}</th>
                <th className="pb-2 text-right font-medium">{t("Their clicks")}</th>
                <th className="pb-2 text-right font-medium">{t("Share of clicks")}</th>
              </tr>
            </thead>
            <tbody>
              {q.repeats.map((r) => (
                <tr key={r.bucket} className="border-b border-line/60">
                  <td className="py-2">{r.bucket}</td>
                  <td className="num py-2 text-right">{formatNumber(r.devices)}</td>
                  <td className="num py-2 text-right">{formatNumber(r.clicks)}</td>
                  <td className="num py-2 text-right text-ink-muted">{pct(r.clicks, q.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q.topDevices.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-semibold">{t("Busiest devices")}</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 font-medium">{t("Clicks")}</th>
                    <th className="pb-2 font-medium">{t("App or browser")}</th>
                    <th className="pb-2 font-medium">{t("Place")}</th>
                    <th className="pb-2 font-medium">{t("From — to")}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.topDevices.map((d, i) => (
                    <tr key={i} className="border-b border-line/60">
                      <td className="num py-2 pr-3">{formatNumber(d.clicks)}</td>
                      <td className="py-2 pr-3 text-ink-muted">{[d.app, d.os].filter(Boolean).join(" · ")}</td>
                      <td className="py-2 pr-3 text-ink-muted">{d.place || "—"}</td>
                      <td className="py-2 text-ink-muted">{formatDateTime(d.first)} — {formatDateTime(d.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <p className="mt-6 text-xs text-ink-faint">{t("Previews of messengers and known bots are not counted as clicks at all; IP addresses are stored only as a hash.")}</p>
    </>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "leads" }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-ink-muted">{label}</div>
      <div className={`num mt-2 text-3xl font-bold tracking-tight ${tone === "leads" ? "text-leads" : "text-ink"}`}>{value}</div>
      <p className="mt-2 text-xs text-ink-faint">{note}</p>
    </div>
  );
}

function Table({ title, rows, total, label }: { title: string; rows: Bucket[]; total: number; label: (k: string) => string }) {
  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line/60">
              <td className="break-words py-2 pr-3">{label(r.key)}</td>
              <td className="hidden w-24 py-2 sm:table-cell">
                <span className="block h-1.5 overflow-hidden rounded-full bg-bg-hover"><i className="block h-full rounded-full bg-accent" style={{ width: `${total ? (r.n / total) * 100 : 0}%` }} /></span>
              </td>
              <td className="num w-20 py-2 text-right">{formatNumber(r.n)}</td>
              <td className="num w-12 py-2 text-right text-ink-muted">{total ? `${Math.round((r.n / total) * 100)}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
