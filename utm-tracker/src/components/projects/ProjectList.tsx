"use client";

import Link from "next/link";
import { CHANNEL_GROUPS, CONCENTRATION, ZONES, labelOf } from "@/lib/projects/dictionaries";
import type { ProjectRow } from "@/lib/projects/rows";
import { cn } from "@/lib/utils";
import { MAX_COMPARE } from "@/lib/projects/filters/state";
import { STATUS_LABEL, fmtDate, fmtMetric, fmtNumber } from "./format";

/** A metric value, or a muted "no data" — missing data never looks like a number. */
function Val({ v, text }: { v: unknown; text: string }) {
  return v === null || v === undefined ? <span className="font-normal text-ink-faint">no data</span> : <span className="num">{text}</span>;
}


const STATUS_TONE: Record<string, string> = {
  planned: "bg-ink-faint/15 text-ink-muted",
  registration: "bg-clicks/15 text-clicks",
  done: "bg-leads/15 text-leads",
  archived: "bg-bg-hover text-ink-faint",
};

export function SmallSample({ n }: { n: number }) {
  return (
    <span className="ml-1.5 inline-flex rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent" title="Few responses: the score may be noise">
      small sample (n={n})
    </span>
  );
}

function Score({ r, small }: { r: ProjectRow; small: boolean }) {
  if (r.orgScore10 === null) return <span className="text-ink-faint">no data</span>;
  return (
    <span>
      <span className="num font-semibold text-ink">{fmtNumber(r.orgScore10, 1)}</span>
      <span className="text-ink-faint">/10</span>
      {small && r.responses !== null && <SmallSample n={r.responses} />}
    </span>
  );
}

function DataBadges({ r }: { r: ProjectRow }) {
  return (
    <span className="flex gap-1">
      <span className={cn("pill px-2 py-0.5 text-[10px]", r.hasRegistrationReport ? "bg-clicks/15 text-clicks" : "bg-bg-hover text-ink-faint")}>
        {r.hasRegistrationReport ? "✓" : "—"} registration
      </span>
      <span className={cn("pill px-2 py-0.5 text-[10px]", r.hasFeedbackReport ? "bg-leads/15 text-leads" : "bg-bg-hover text-ink-faint")}>
        {r.hasFeedbackReport ? "✓" : "—"} feedback
      </span>
    </span>
  );
}

function Pick({ r, picked, onPick, disabled }: { r: ProjectRow; picked: boolean; onPick: () => void; disabled: boolean }) {
  return (
    <label className={cn("flex items-center gap-1.5 text-xs", disabled ? "text-ink-faint" : "cursor-pointer text-ink-muted hover:text-ink")}>
      <input type="checkbox" className="h-4 w-4 accent-accent" checked={picked} disabled={disabled} onChange={onPick} aria-label={`Compare: ${r.name}`} />
      compare
    </label>
  );
}

export function ProjectList({
  rows,
  view,
  small,
  picked,
  onPick,
}: {
  rows: ProjectRow[];
  view: "cards" | "table";
  small: Set<string>;
  picked: string[];
  onPick: (slug: string) => void;
}) {
  const full = picked.length >= MAX_COMPARE;
  if (view === "table") {
    return (
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-faint">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium"><span className="sr-only">Compare</span></th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Registrations</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 text-right font-medium">NPS</th>
              <th className="px-4 py-3 text-right font-medium">Response rate</th>
              <th className="px-4 py-3 font-medium">Weakest area</th>
              <th className="px-4 py-3 font-medium">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-bg-hover/40">
                <td className="px-4 py-3">
                  <input type="checkbox" className="h-4 w-4 accent-accent" checked={picked.includes(r.slug)} disabled={full && !picked.includes(r.slug)}
                    onChange={() => onPick(r.slug)} aria-label={`Compare: ${r.name}`} />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/projects/${r.slug}`} className="font-medium text-ink hover:text-accent">{r.name}</Link>
                  <p className="text-xs text-ink-faint">{r.typeName} · {STATUS_LABEL[r.status]}{r.city ? ` · ${r.city}` : ""}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{fmtDate(r.startDate)}</td>
                <td className="num px-4 py-3 text-right">{r.registrants === null ? <span className="text-ink-faint">—</span> : fmtNumber(r.registrants)}</td>
                <td className="whitespace-nowrap px-4 py-3"><Score r={r} small={small.has(r.id)} /></td>
                <td className="num px-4 py-3 text-right">{r.nps === null ? <span className="text-ink-faint">—</span> : `${r.nps > 0 ? "+" : ""}${fmtNumber(r.nps)}`}</td>
                <td className="num px-4 py-3 text-right">{r.responseRate === null ? <span className="text-ink-faint">—</span> : fmtMetric(r.responseRate, { unit: "%", scale: 100, decimals: 1 })}</td>
                <td className="px-4 py-3 text-ink-muted">{r.weakestZone ? `${labelOf(ZONES, r.weakestZone)} · ${fmtNumber(r.weakestZoneScore10 ?? 0, 1)}` : "—"}</td>
                <td className="px-4 py-3"><DataBadges r={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <li key={r.id} className={cn("card flex flex-col p-5", picked.includes(r.slug) && "border-accent/60")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/projects/${r.slug}`} className="font-display text-base font-semibold leading-snug text-ink hover:text-accent">{r.name}</Link>
              <p className="mt-0.5 text-xs text-ink-faint">{r.typeName} · {fmtDate(r.startDate)}{r.city ? ` · ${r.city}` : ""}</p>
            </div>
            <span className={cn("pill shrink-0 text-[11px]", STATUS_TONE[r.status])}>{STATUS_LABEL[r.status]}</span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Score</dt>
              <dd><Score r={r} small={small.has(r.id)} /></dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Registrations</dt>
              <dd><Val v={r.registrants} text={r.registrants === null ? "" : fmtNumber(r.registrants)} /></dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Response rate</dt>
              <dd><Val v={r.responseRate} text={fmtMetric(r.responseRate, { unit: "%", scale: 100, decimals: 1 })} /></dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Weakest area</dt>
              <dd className={r.weakestZone ? "text-ink" : "text-ink-faint"}>{r.weakestZone ? labelOf(ZONES, r.weakestZone) : "no data"}</dd>
            </div>
          </dl>
          <div className="mt-auto flex items-center justify-between gap-2 pt-4">
            <DataBadges r={r} />
            <Pick r={r} picked={picked.includes(r.slug)} disabled={full && !picked.includes(r.slug)} onPick={() => onPick(r.slug)} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ─── Compare up to MAX_COMPARE projects ──────────────────────────────────────── */

type Better = "high" | "low" | null;
const COMPARE_ROWS: { label: string; get: (r: ProjectRow) => number | string | null; fmt?: (r: ProjectRow) => string; better: Better }[] = [
  { label: "Registrations", get: (r) => r.registrants, better: "high" },
  { label: "Feedback responses", get: (r) => r.responses, better: "high" },
  { label: "Response rate", get: (r) => r.responseRate, fmt: (r) => fmtMetric(r.responseRate, { unit: "%", scale: 100, decimals: 1 }), better: "high" },
  { label: "Organization score", get: (r) => r.orgScore10, fmt: (r) => fmtMetric(r.orgScore10, { unit: "/10", decimals: 2 }), better: "high" },
  { label: "NPS proxy", get: (r) => r.nps, fmt: (r) => (r.nps === null ? "no data" : `${r.nps > 0 ? "+" : ""}${fmtNumber(r.nps)}`), better: "high" },
  { label: "Composite score", get: (r) => r.composite10, fmt: (r) => fmtMetric(r.composite10, { unit: "/10", decimals: 2 }), better: "high" },
  { label: "Weakest area", get: (r) => r.weakestZoneScore10, fmt: (r) => (r.weakestZone ? `${labelOf(ZONES, r.weakestZone)} · ${fmtNumber(r.weakestZoneScore10 ?? 0, 1)}/10` : "no data"), better: "high" },
  { label: "Strongest area", get: (r) => r.strongestZone, fmt: (r) => (r.strongestZone ? `${labelOf(ZONES, r.strongestZone)} · ${fmtNumber(r.strongestZoneScore10 ?? 0, 1)}/10` : "no data"), better: null },
  { label: "Top channel group", get: (r) => r.topChannelGroup, fmt: (r) => (r.topChannelGroup ? `${labelOf(CHANNEL_GROUPS, r.topChannelGroup)} · ${fmtMetric(r.topChannelShare, { unit: "%", scale: 100 })}` : "no data"), better: null },
  { label: "Channel concentration", get: (r) => r.hhiGroups, fmt: (r) => (r.concentrationLevel ? `${labelOf(CONCENTRATION, r.concentrationLevel)} · HHI ${fmtNumber(r.hhiGroups ?? 0, 2)}` : "no data"), better: "low" },
  { label: "Peak day", get: (r) => r.peakDayShare, fmt: (r) => fmtMetric(r.peakDayShare, { unit: "%", scale: 100 }), better: null },
  { label: "Top university share", get: (r) => r.topUniversityShare, fmt: (r) => (r.topUniversityName ? `${fmtMetric(r.topUniversityShare, { unit: "%", scale: 100 })} · ${r.topUniversityName}` : "no data"), better: null },
  { label: "New to AIESEC", get: (r) => r.newToOrgShare, fmt: (r) => fmtMetric(r.newToOrgShare, { unit: "%", scale: 100 }), better: "high" },
  { label: "Want an internship", get: (r) => r.internshipShare, fmt: (r) => fmtMetric(r.internshipShare, { unit: "%", scale: 100 }), better: "high" },
  { label: "Average age", get: (r) => r.avgAge, fmt: (r) => fmtMetric(r.avgAge, { unit: "years", decimals: 1 }), better: null },
  { label: "Duplicate rate", get: (r) => r.duplicateRate, fmt: (r) => fmtMetric(r.duplicateRate, { unit: "%", scale: 100, decimals: 1 }), better: "low" },
];

export function ComparePanel({ rows, small, onRemove, onClose }: { rows: ProjectRow[]; small: Set<string>; onRemove: (slug: string) => void; onClose: () => void }) {
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="cmp-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="cmp-title" className="font-display text-lg font-semibold">Compare projects</h2>
        <button type="button" className="btn-ghost py-1.5 text-xs" onClick={onClose}>Close</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-4 text-xs font-medium text-ink-faint">Metric</th>
              {rows.map((r) => (
                <th key={r.id} className="py-2 pr-4 align-bottom">
                  <span className="block font-semibold text-ink">{r.name}</span>
                  <span className="block text-xs font-normal text-ink-faint">{r.typeName} · {fmtDate(r.startDate)}</span>
                  {small.has(r.id) && r.responses !== null && <SmallSample n={r.responses} />}
                  <button type="button" className="mt-1 block text-[11px] font-normal text-ink-faint hover:text-danger" onClick={() => onRemove(r.slug)}>remove</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {COMPARE_ROWS.map((m) => {
              const vals = rows.map((r) => m.get(r));
              const nums = vals.filter((v): v is number => typeof v === "number");
              const best = m.better && nums.length >= 2 ? (m.better === "high" ? Math.max(...nums) : Math.min(...nums)) : null;
              const worst = m.better && nums.length >= 2 ? (m.better === "high" ? Math.min(...nums) : Math.max(...nums)) : null;
              return (
                <tr key={m.label}>
                  <th scope="row" className="py-2 pr-4 text-left text-xs font-normal text-ink-muted">{m.label}</th>
                  {rows.map((r, i) => {
                    const v = vals[i];
                    const isBest = best !== null && v === best && best !== worst;
                    const isWorst = worst !== null && v === worst && best !== worst;
                    return (
                      <td key={r.id} className={cn("py-2 pr-4", isBest && "text-leads", isWorst && "text-accent", v === null && "text-ink-faint")}>
                        {m.fmt ? m.fmt(r) : v === null ? "no data" : typeof v === "number" ? fmtNumber(v) : v}
                        {isBest && <span className="ml-1 text-[10px]" aria-label="best">▲</span>}
                        {isWorst && <span className="ml-1 text-[10px]" aria-label="worst">▼</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-faint">▲ best and ▼ worst value in each row. Treat scores from small samples with care.</p>
    </section>
  );
}
