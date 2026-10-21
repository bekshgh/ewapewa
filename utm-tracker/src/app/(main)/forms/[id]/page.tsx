import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { filterOptions, report, sessions as listSessions, slice } from "@/lib/formAnalytics/report";
import { FormRename } from "@/components/FormRename";
import { SLICES, duration, fieldLabel, formTitle, labelsOf, parseFilter, pickSlice, type SP } from "@/lib/formAnalytics/filters";
import { FormProjectPicker } from "@/components/FormProjectPicker";
import { currentActor } from "@/lib/auth";
import { canEditFolder } from "@/lib/permissions";
import { allProjectGroups } from "@/lib/projectStats";
import { formatNumber, formatPercent } from "@/lib/utils";
import { getLang, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function FormReportPage(props: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id: raw }, sp] = await Promise.all([props.params, props.searchParams]);
  const id = decodeURIComponent(raw);
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const form = await prisma.analyticsForm.findUnique({ where: { id } });
  if (!form) notFound();
  const f = parseFilter(id, sp);
  const by = pickSlice(sp.slice);
  const [r, options, sliceRows, recent, actor, groups] = await Promise.all([report(f), filterOptions(id), slice(f, by), listSessions(f, 50), currentActor(), allProjectGroups()]);
  const labels = labelsOf(form.fields);
  const fl = (k: string) => t(fieldLabel(k, labels));
  const projects = groups
    .filter((g) => canEditFolder(actor, g.key) || g.key === form.projectSlug)
    .map((g) => ({ key: g.key, title: g.title }));
  const mayPick = (k: string | null) => (k ? canEditFolder(actor, k) : actor?.role === "admin" && actor.status === "active");
  const projectTitle = groups.find((g) => g.key === form.projectSlug)?.title ?? form.projectSlug;
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && v ? [[k, v]] : [])));
  const withQ = (extra: Record<string, string>) => {
    const x = new URLSearchParams(q);
    for (const [k, v] of Object.entries(extra)) x.set(k, v);
    return `?${x.toString()}`;
  };
  const fn = r.funnel;
  const steps = [
    { label: t("Sessions on the page"), n: fn.sessions },
    { label: t("Reached the form"), n: fn.reachedForm },
    { label: t("Started filling in"), n: fn.started },
    { label: t("Pressed «Send»"), n: fn.attempted },
    { label: t("Sent successfully"), n: fn.success },
  ];
  const leaves = [
    { label: t("Left before the form"), n: r.leave.beforeFormSeen, muted: true },
    { label: t("Saw the form, didn't start"), n: r.leave.sawFormNotStarted, muted: true },
    ...r.fields.filter((x) => x.leftHere > 0).map((x) => ({ label: fl(x.k), n: x.leftHere, muted: false })),
  ];
  const maxLeave = Math.max(1, ...leaves.map((l) => l.n));
  const maxBlocked = Math.max(1, ...r.blocked.map((b) => b.sessions));

  return (
    <>
      <PageHeader
        breadcrumb={t("Forms")}
        title={formTitle(form)}
        titleAction={mayPick(form.projectSlug) ? <FormRename id={id} name={formTitle(form)} autoName={form.title || form.id} /> : undefined}
        subtitle={`${form.pageUrl ? `${form.pageUrl.replace(/^https?:\/\//, "")} · ` : ""}${projectTitle ? `${projectTitle} · ` : ""}${t("{v} visitors · {s} sessions", { v: formatNumber(fn.visitors), s: formatNumber(fn.sessions) })}`}
        action={
          <div className="flex flex-wrap gap-2">
            {form.projectSlug && <Link href={`/campaigns/projects/${form.projectSlug}`} className="btn-ghost text-sm">{t("Project folder")} →</Link>}
            <a href={`/api/forms/${encodeURIComponent(id)}/export${withQ({ kind: "fields" })}`} className="btn-ghost text-sm">{t("CSV: fields")}</a>
            <a href={`/api/forms/${encodeURIComponent(id)}/export${withQ({ kind: "sessions" })}`} className="btn-ghost text-sm">{t("CSV: sessions")}</a>
          </div>
        }
      />

      <FormProjectPicker
        formId={id}
        current={form.projectSlug}
        byHand={form.projectSetByHand}
        projects={projects}
        editable={(!form.projectSlug || mayPick(form.projectSlug)) && projects.some((p) => mayPick(p.key))}
      />

      <form className="card mb-6 grid gap-3 p-4 text-sm sm:grid-cols-4 lg:grid-cols-8" method="get">
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-faint">{t("From")}</span><input className="input" type="date" name="from" defaultValue={typeof sp.from === "string" ? sp.from : ""} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-faint">{t("To")}</span><input className="input" type="date" name="to" defaultValue={typeof sp.to === "string" ? sp.to : ""} /></label>
        {(
          [
            ["source", t("Source"), options.source],
            ["campaign", t("Campaign"), options.campaign],
            ["device", t("Device"), options.device],
            ["lang", t("Language"), options.lang],
            ["city", t("City"), options.city],
          ] as const
        ).map(([name, label, values]) => (
          <label key={name} className="flex flex-col gap-1">
            <span className="text-xs text-ink-faint">{label}</span>
            <select className="input" name={name} defaultValue={typeof sp[name] === "string" ? (sp[name] as string) : ""}>
              <option value="">{t("All")}</option>
              {values.map((v) => <option key={v} value={v}>{v}</option>)}
              {(name === "source" || name === "campaign" || name === "city") && <option value="(none)">{t("(none)")}</option>}
            </select>
          </label>
        ))}
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" name="test" value="1" defaultChecked={f.includeTest} className="accent-accent" /> {t("include test")}
          </label>
          <button className="btn-primary text-sm" type="submit">{t("Apply")}</button>
        </div>
      </form>

      <section className="card mb-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-semibold">{t("Funnel")}</h2>
          <p className="text-sm text-ink-muted">
            {t("Conversion")} <b className="num text-ink">{formatPercent(fn.conversion)}</b> · {t("completion (started → sent)")} <b className="num text-ink">{formatPercent(fn.completion)}</b>
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
          <h2 className="font-display text-base font-semibold">{t("Questions")}</h2>
          <p className="mt-1 text-xs text-ink-faint">
            {t("In form order. «Reached» — started and got at least to this question; conditional questions count only those who had them shown. «Left here» — ended without sending, and this was the last active question. No typed answers are stored.")}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3 font-medium">{t("Question")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Reached")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Filled")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Left here")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Drop-off")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Errors")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Avg time")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Median")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("Revisits")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.fields.map((x) => (
                <tr key={x.k} className="hover:bg-bg-hover/40">
                  <td className="px-5 py-2.5">
                    <span className="text-ink">{fl(x.k)}</span>
                    {x.conditional && <span className="ml-2 rounded bg-bg-raised px-1.5 py-0.5 text-[11px] text-ink-faint">{t("conditional · shown to {n}", { n: formatNumber(x.shown ?? 0) })}</span>}
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
          <h2 className="font-display text-base font-semibold">{t("Where people leave")}</h2>
          <p className="mt-1 text-xs text-ink-faint">{t("Sessions that ended without sending, by the last thing they did.")}</p>
          <div className="mt-4 space-y-2">
            {leaves.every((l) => l.n === 0) && <p className="text-sm text-ink-faint">{t("Nobody has left yet.")}</p>}
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
          <h2 className="font-display text-base font-semibold">{t("Blocked on «Send»")}</h2>
          <p className="mt-1 text-xs text-ink-faint">{t("Required questions left empty when people pressed «Send» (sessions).")}</p>
          <div className="mt-4 space-y-2">
            {r.blocked.length === 0 && <p className="text-sm text-ink-faint">{t("No blocked attempts.")}</p>}
            {r.blocked.map((b) => (
              <div key={b.k} className="grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate text-ink-muted">{fl(b.k)}</span>
                <div className="h-5 rounded bg-bg-raised"><div className="h-5 rounded bg-accent/60" style={{ width: `${(b.sessions / maxBlocked) * 100}%` }} /></div>
                <span className="num w-10 text-right text-ink">{formatNumber(b.sessions)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold">{t("Slices")}</h2>
          <div className="flex flex-wrap gap-1.5">
            {SLICES.map((s) => (
              <Link key={s.by} href={withQ({ slice: s.by })} scroll={false}
                className={`rounded-lg border px-2.5 py-1 text-xs ${by === s.by ? "border-accent bg-accent/15 text-accent" : "border-line text-ink-muted hover:border-accent/50"}`}>
                {t(s.title)}
              </Link>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3 font-medium">{t(SLICES.find((s) => s.by === by)?.title ?? "")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Sessions")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Started")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Pressed «Send»")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Sent")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("Conversion")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("Completion")}</th>
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
          <h2 className="font-display text-base font-semibold">{t("Latest sessions")}</h2>
          <p className="mt-1 text-xs text-ink-faint">{t("Open one to see its timeline (no typed answers are kept).")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3 font-medium">{t("Started at")}</th>
                <th className="px-3 py-3 font-medium">{t("Outcome")}</th>
                <th className="px-3 py-3 font-medium">{t("Last question")}</th>
                <th className="px-3 py-3 font-medium">{t("Source")}</th>
                <th className="px-3 py-3 font-medium">{t("Device")}</th>
                <th className="px-3 py-3 font-medium">{t("City")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("Time on page")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.map((s) => (
                <tr key={s.id} className="hover:bg-bg-hover/40">
                  <td className="px-5 py-2.5">
                    <Link href={`/forms/${encodeURIComponent(id)}/sessions/${s.id}`} className="text-ink hover:text-accent">
                      {s.startedAt.toLocaleString(lang === "ru" ? "ru-RU" : "en-GB", { timeZone: "Asia/Almaty", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Link>
                    {s.isTest && <span className="ml-2 text-[11px] text-ink-faint">{t("test")}</span>}
                  </td>
                  <td className={`px-3 py-2.5 ${s.outcome === "success" ? "text-leads" : s.outcome === "abandoned" ? "text-danger" : "text-ink-muted"}`}>{t(s.outcome)}</td>
                  <td className="px-3 py-2.5 text-ink-muted">{s.lastField ? fl(s.lastField) : "—"}</td>
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
