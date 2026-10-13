import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { filterOptions, report, sessions as listSessions, slice } from "@/lib/formAnalytics/report";
import { SLICES, duration, fieldLabel, parseFilter, pickSlice, type SP } from "@/lib/formAnalytics/filters";
import { formatNumber, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FormReportPage(props: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id: raw }, sp] = await Promise.all([props.params, props.searchParams]);
  const id = decodeURIComponent(raw);
  const form = await prisma.analyticsForm.findUnique({ where: { id } });
  if (!form) notFound();
  const f = parseFilter(id, sp);
  const by = pickSlice(sp.slice);
  const [r, options, sliceRows, recent] = await Promise.all([report(f), filterOptions(id), slice(f, by), listSessions(f, 50)]);
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && v ? [[k, v]] : [])));
  const withQ = (extra: Record<string, string>) => {
    const x = new URLSearchParams(q);
    for (const [k, v] of Object.entries(extra)) x.set(k, v);
    return `?${x.toString()}`;
  };
  const fn = r.funnel;
  const steps = [
    { label: "Sessions on the page", n: fn.sessions },
    { label: "Reached the form", n: fn.reachedForm },
    { label: "Started filling in", n: fn.started },
    { label: "Pressed «Send»", n: fn.attempted },
    { label: "Sent successfully", n: fn.success },
  ];
  const leaves = [
    { label: "Left before the form", n: r.leave.beforeFormSeen, muted: true },
    { label: "Saw the form, didn't start", n: r.leave.sawFormNotStarted, muted: true },
    ...r.fields.filter((x) => x.leftHere > 0).map((x) => ({ label: fieldLabel(x.k), n: x.leftHere, muted: false })),
  ];
  const maxLeave = Math.max(1, ...leaves.map((l) => l.n));
  const maxBlocked = Math.max(1, ...r.blocked.map((b) => b.sessions));

  return (
    <>
      <PageHeader
        breadcrumb="Forms"
        title={id}
        subtitle={`${form.projectSlug ? `Project ${form.projectSlug} · ` : ""}${formatNumber(fn.visitors)} visitors · ${formatNumber(fn.sessions)} sessions`}
        action={
          <div className="flex flex-wrap gap-2">
            {form.projectSlug && <Link href={`/campaigns/projects/${form.projectSlug}`} className="btn-ghost text-sm">Project folder →</Link>}
            <a href={`/api/forms/${encodeURIComponent(id)}/export${withQ({ kind: "fields" })}`} className="btn-ghost text-sm">CSV: fields</a>
            <a href={`/api/forms/${encodeURIComponent(id)}/export${withQ({ kind: "sessions" })}`} className="btn-ghost text-sm">CSV: sessions</a>
          </div>
        }
      />

      <form className="card mb-6 grid gap-3 p-4 text-sm sm:grid-cols-4 lg:grid-cols-8" method="get">
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-faint">From</span><input className="input" type="date" name="from" defaultValue={typeof sp.from === "string" ? sp.from : ""} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-faint">To</span><input className="input" type="date" name="to" defaultValue={typeof sp.to === "string" ? sp.to : ""} /></label>
        {(
          [
            ["source", "Source", options.source],
            ["campaign", "Campaign", options.campaign],
            ["device", "Device", options.device],
            ["lang", "Language", options.lang],
            ["city", "City", options.city],
          ] as const
        ).map(([name, label, values]) => (
          <label key={name} className="flex flex-col gap-1">
            <span className="text-xs text-ink-faint">{label}</span>
            <select className="input" name={name} defaultValue={typeof sp[name] === "string" ? (sp[name] as string) : ""}>
              <option value="">All</option>
              {values.map((v) => <option key={v} value={v}>{v}</option>)}
              {(name === "source" || name === "campaign" || name === "city") && <option value="(none)">(none)</option>}
            </select>
          </label>
        ))}
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" name="test" value="1" defaultChecked={f.includeTest} className="accent-accent" /> include test
          </label>
          <button className="btn-primary text-sm" type="submit">Apply</button>
        </div>
      </form>

      <section className="card mb-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Funnel</h2>
          <p className="text-sm text-ink-muted">
            Conversion <b className="num text-ink">{formatPercent(fn.conversion)}</b> · completion (started → sent) <b className="num text-ink">{formatPercent(fn.completion)}</b>
          </p>
        </div>
        <div className="mt-4 space-y-2">
          {steps.map((s, i) => (
            <div key={s.label} className="grid grid-cols-[minmax(130px,200px)_1fr_auto] items-center gap-3 text-sm">
              <span className="text-ink-muted">{s.label}</span>
              <div className="h-6 rounded-md bg-bg-raised">
                <div className="h-6 rounded-md bg-accent/70" style={{ width: `${fn.sessions ? Math.max((s.n / fn.sessions) * 100, s.n ? 1 : 0) : 0}%` }} />
              </div>
              <span className="num w-28 text-right text-ink">
                {formatNumber(s.n)} <span className="text-xs text-ink-faint">{i ? formatPercent(steps[i - 1].n ? (s.n / steps[i - 1].n) * 100 : 0, 0) : ""}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card mb-6 overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold">Questions</h2>
          <p className="mt-1 text-xs text-ink-faint">
            In form order. «Reached» — started and got at least to this question; conditional questions count only those who had them shown.
            «Left here» — ended without sending, and this was the last active question. No typed answers are stored.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3 font-medium">Question</th>
                <th className="px-3 py-3 text-right font-medium">Reached</th>
                <th className="px-3 py-3 text-right font-medium">Filled</th>
                <th className="px-3 py-3 text-right font-medium">Left here</th>
                <th className="px-3 py-3 text-right font-medium">Drop-off</th>
                <th className="px-3 py-3 text-right font-medium">Errors</th>
                <th className="px-3 py-3 text-right font-medium">Avg time</th>
                <th className="px-3 py-3 text-right font-medium">Median</th>
                <th className="px-5 py-3 text-right font-medium">Revisits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.fields.map((x) => (
                <tr key={x.k} className="hover:bg-bg-hover/40">
                  <td className="px-5 py-2.5">
                    <span className="text-ink">{fieldLabel(x.k)}</span>
                    {x.conditional && <span className="ml-2 rounded bg-bg-raised px-1.5 py-0.5 text-[11px] text-ink-faint">conditional · shown to {formatNumber(x.shown ?? 0)}</span>}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-ink">{formatNumber(x.reached)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-muted">{formatNumber(x.filled)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink">{formatNumber(x.leftHere)}</td>
                  <td className={`num px-3 py-2.5 text-right font-medium ${x.dropOff >= 15 ? "text-danger" : "text-ink"}`}>{x.reached ? formatPercent(x.dropOff) : "—"}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-muted">{x.reached ? formatPercent(x.errorRate) : "—"}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-muted">{duration(x.avgMs)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-muted">{duration(x.medianMs)}</td>
                  <td className="num px-5 py-2.5 text-right text-ink-muted">{formatNumber(x.refocus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-display text-base font-semibold">Where people leave</h2>
          <p className="mt-1 text-xs text-ink-faint">Sessions that ended without sending, by the last thing they did.</p>
          <div className="mt-4 space-y-2">
            {leaves.every((l) => l.n === 0) && <p className="text-sm text-ink-faint">Nobody has left yet.</p>}
            {leaves.filter((l) => l.n > 0).map((l) => (
              <div key={l.label} className="grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate text-ink-muted">{l.label}</span>
                <div className="h-5 rounded bg-bg-raised"><div className={`h-5 rounded ${l.muted ? "bg-ink-faint/40" : "bg-danger/70"}`} style={{ width: `${(l.n / maxLeave) * 100}%` }} /></div>
                <span className="num w-10 text-right text-ink">{formatNumber(l.n)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="font-display text-base font-semibold">Blocked on «Send»</h2>
          <p className="mt-1 text-xs text-ink-faint">Required questions left empty when people pressed «Send» (sessions).</p>
          <div className="mt-4 space-y-2">
            {r.blocked.length === 0 && <p className="text-sm text-ink-faint">No blocked attempts.</p>}
            {r.blocked.map((b) => (
              <div key={b.k} className="grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate text-ink-muted">{fieldLabel(b.k)}</span>
                <div className="h-5 rounded bg-bg-raised"><div className="h-5 rounded bg-accent/60" style={{ width: `${(b.sessions / maxBlocked) * 100}%` }} /></div>
                <span className="num w-10 text-right text-ink">{formatNumber(b.sessions)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold">Slices</h2>
          <div className="flex flex-wrap gap-1.5">
            {SLICES.map((s) => (
              <Link key={s.by} href={withQ({ slice: s.by })} scroll={false}
                className={`rounded-lg border px-2.5 py-1 text-xs ${by === s.by ? "border-accent bg-accent/15 text-accent" : "border-line text-ink-muted hover:border-accent/50"}`}>
                {s.title}
              </Link>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3 font-medium">{SLICES.find((s) => s.by === by)?.title}</th>
                <th className="px-3 py-3 text-right font-medium">Sessions</th>
                <th className="px-3 py-3 text-right font-medium">Started</th>
                <th className="px-3 py-3 text-right font-medium">Pressed «Send»</th>
                <th className="px-3 py-3 text-right font-medium">Sent</th>
                <th className="px-3 py-3 text-right font-medium">Conversion</th>
                <th className="px-5 py-3 text-right font-medium">Completion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sliceRows.map((x) => (
                <tr key={x.key}>
                  <td className="px-5 py-2.5 text-ink">{x.key}</td>
                  <td className="num px-3 py-2.5 text-right">{formatNumber(x.sessions)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-muted">{formatNumber(x.started)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-muted">{formatNumber(x.attempted)}</td>
                  <td className="num px-3 py-2.5 text-right text-leads">{formatNumber(x.success)}</td>
                  <td className="num px-3 py-2.5 text-right font-medium">{formatPercent(x.conversion)}</td>
                  <td className="num px-5 py-2.5 text-right text-ink-muted">{x.started ? formatPercent(x.completion) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold">Latest sessions</h2>
          <p className="mt-1 text-xs text-ink-faint">Open one to see its timeline (no typed answers are kept).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3 font-medium">Started</th>
                <th className="px-3 py-3 font-medium">Outcome</th>
                <th className="px-3 py-3 font-medium">Last question</th>
                <th className="px-3 py-3 font-medium">Source</th>
                <th className="px-3 py-3 font-medium">Device</th>
                <th className="px-3 py-3 font-medium">City</th>
                <th className="px-5 py-3 text-right font-medium">Time on page</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.map((s) => (
                <tr key={s.id} className="hover:bg-bg-hover/40">
                  <td className="px-5 py-2.5">
                    <Link href={`/forms/${encodeURIComponent(id)}/sessions/${s.id}`} className="text-ink hover:text-accent">
                      {s.startedAt.toLocaleString("en-GB", { timeZone: "Asia/Almaty", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Link>
                    {s.isTest && <span className="ml-2 text-[11px] text-ink-faint">test</span>}
                  </td>
                  <td className={`px-3 py-2.5 ${s.outcome === "success" ? "text-leads" : s.outcome === "abandoned" ? "text-danger" : "text-ink-muted"}`}>{s.outcome}</td>
                  <td className="px-3 py-2.5 text-ink-muted">{s.lastField ? fieldLabel(s.lastField) : "—"}</td>
                  <td className="px-3 py-2.5 text-ink-muted">{s.utmSource ?? "—"}</td>
                  <td className="px-3 py-2.5 text-ink-muted">{s.device ?? "—"}</td>
                  <td className="px-3 py-2.5 text-ink-muted">{s.city ?? "—"}</td>
                  <td className="num px-5 py-2.5 text-right text-ink-muted">{duration(s.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
