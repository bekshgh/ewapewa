"use client";

import { useMemo, useState } from "react";
import type { CellValue, TableSection, TableView } from "@/lib/reports/types";
import { cn } from "@/lib/utils";
import { csvValue, formatValue, isNumericCol, legacyText, readableTitle } from "./format";
import { useT } from "@/lib/i18n/client";

const SMALL_N = 10;

type HeatMode = { from: number; to: number; mode: "sequential" | "diverging" | "minmax" };

/** Column that holds the sample size, if the table has one ("n" or "Regs"). */
export function sampleCol(t: TableSection): number {
  return t.columns.findIndex((c) => /^(n|regs)$/i.test(c.label.trim()));
}

const BADGES: Record<string, string> = {
  spike: "bg-danger/15 text-danger",
  zero: "bg-ink-faint/15 text-ink-muted",
  burst: "bg-accent/15 text-accent",
  wave: "bg-clicks/15 text-clicks",
  "always-on": "bg-leads/15 text-leads",
  low: "bg-leads/15 text-leads",
  moderate: "bg-accent/15 text-accent",
  high: "bg-danger/15 text-danger",
  strong: "bg-clicks/15 text-clicks",
  nu: "bg-clicks/15 text-clicks",
  other: "bg-accent/15 text-accent",
  tie: "bg-ink-faint/15 text-ink-muted",
};

function badgeClass(v: string): string | undefined {
  const k = v.replace(/^[▲▼○●✓⚠]\s*/, "").trim().toLowerCase();
  return BADGES[k];
}

export function SmallSampleBadge() {
  const tr = useT();
  return (
    <span className="ml-1.5 inline-flex rounded-full bg-ink-faint/15 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted" title={tr("Fewer than {n} people — directional only", { n: SMALL_N })}>
      {tr("small sample")}
    </span>
  );
}

/* ─── Data table (sortable, optional heat, search, CSV) ─────────── */

export function DataTable({
  t,
  heat,
  searchable,
  smallSamples,
}: {
  t: TableSection;
  heat?: HeatMode;
  searchable?: boolean;
  smallSamples?: boolean;
}) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const tr = useT();
  const [q, setQ] = useState("");
  const showSearch = searchable || t.rows.length > 15;
  const nCol = smallSamples ? sampleCol(t) : -1;

  const body = useMemo(() => {
    const idx = t.rows.map((_, i) => i).filter((i) => i !== t.totalRow);
    const query = q.trim().toLowerCase();
    let rows = query ? idx.filter((i) => t.rows[i].some((v) => v !== null && String(v).toLowerCase().includes(query))) : idx;
    if (sort) {
      rows = [...rows].sort((a, b) => cmp(t.rows[a][sort.col], t.rows[b][sort.col]) * sort.dir);
    }
    return rows;
  }, [t, q, sort]);

  const scales = useMemo(() => (heat ? heatScales(t, heat) : null), [t, heat]);
  // Status pills only for columns made entirely of statuses (Flag, Profile, Winner…),
  // so a university called "Other" stays plain text.
  const badgeCols = useMemo(() => {
    const out = new Set<number>();
    t.columns.forEach((_, ci) => {
      const vals = t.rows.map((r) => r[ci]).filter((v): v is string => typeof v === "string");
      if (vals.length && vals.length === t.rows.filter((r) => r[ci] !== null).length && vals.every((v) => badgeClass(v))) out.add(ci);
    });
    return out;
  }, [t]);

  const toggleSort = (ci: number) =>
    setSort((s) => (s?.col === ci ? (s.dir === -1 ? { col: ci, dir: 1 } : null) : { col: ci, dir: isNumericCol(t.columns[ci]) ? -1 : 1 }));

  const renderRow = (ri: number, total = false) => {
    const row = t.rows[ri];
    const n = nCol >= 0 ? row[nCol] : null;
    const small = !total && typeof n === "number" && n < SMALL_N;
    return (
      <tr key={ri} className={cn("border-t border-line", total ? "bg-bg-raised/60 font-semibold" : "hover:bg-bg-hover/40", small && "text-ink-faint")}>
        {row.map((v, ci) => {
          const col = t.columns[ci];
          const num = isNumericCol(col) && typeof v === "number";
          const style = !total && scales ? scales.style(ci, v, small) : undefined;
          const text = formatValue(v, col.cellFormats?.[ri] ?? col.format);
          const badge = badgeCols.has(ci) && typeof v === "string" ? badgeClass(v) : undefined;
          return (
            <td
              key={ci}
              className={cn("whitespace-nowrap px-3 py-2", num || col.format.kind === "date" ? "num text-right" : "text-left", ci === 0 && "sticky left-0 z-[1] bg-bg-card")}
              style={style?.css}
            >
              {badge ? <span className={cn("pill", badge)}>{text}</span> : text}
              {style?.mark && <span className="sr-only">{style.mark}</span>}
              {ci === 0 && small && <SmallSampleBadge />}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div>
      {showSearch && (
        <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
          <input
            className="input max-w-xs py-2"
            placeholder={tr("Search…")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={tr("Search in {name}", { name: readableTitle(t.title) })}
          />
          {searchable && (
            <button type="button" className="btn-ghost py-2 text-xs" onClick={() => downloadCsv(t)}>
              {tr("Download CSV")}
            </button>
          )}
        </div>
      )}
      <div className="relative max-h-[70vh] overflow-auto rounded-xl border border-line print:max-h-none">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-[2] bg-bg-raised">
            <tr>
              {t.columns.map((c, ci) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort?.col === ci ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={cn("whitespace-nowrap px-3 py-2.5 text-xs font-medium text-ink-muted", isNumericCol(c) || c.format.kind === "date" ? "text-right" : "text-left", ci === 0 && "sticky left-0 z-[3] bg-bg-raised")}
                >
                  <button type="button" onClick={() => toggleSort(ci)} className="inline-flex items-center gap-1 hover:text-ink">
                    {legacyText(c.label)}
                    <span aria-hidden className="text-[10px] text-ink-faint">{sort?.col === ci ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((ri) => renderRow(ri))}
            {t.totalRow !== undefined && !q && renderRow(t.totalRow, true)}
            {body.length === 0 && (
              <tr>
                <td colSpan={t.columns.length} className="px-3 py-6 text-center text-ink-faint">{tr("Nothing found")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {heat && <HeatLegend mode={heat.mode} />}
    </div>
  );
}

function HeatLegend({ mode }: { mode: HeatMode["mode"] }) {
  const tr = useT();
  return (
    <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
      {mode === "diverging" && (
        <>
          <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm" style={{ background: "rgba(91,155,255,0.45)" }} /> ▲ {tr("above average")}</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm" style={{ background: "rgba(249,115,22,0.45)" }} /> ▼ {tr("below average")}</span>
        </>
      )}
      {mode === "minmax" && (
        <>
          <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm" style={{ background: "rgba(62,207,142,0.35)" }} /> {tr("best in column")}</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm" style={{ background: "rgba(246,179,82,0.35)" }} /> {tr("worst in column")}</span>
        </>
      )}
      {mode === "sequential" && (
        <span className="flex items-center gap-1"><span className="h-2.5 w-10 rounded-sm" style={{ background: "linear-gradient(90deg, rgba(91,155,255,0.06), rgba(91,155,255,0.6))" }} /> {tr("darker = larger")}</span>
      )}
    </p>
  );
}

function heatScales(t: TableSection, h: HeatMode) {
  const nCol = sampleCol(t);
  const stats = new Map<number, { min: number; max: number; absMax: number }>();
  for (let ci = h.from; ci <= h.to && ci < t.columns.length; ci++) {
    // Sample size and row totals are not part of the comparison.
    if (!isNumericCol(t.columns[ci]) || ci === nCol || /^(total|all)$/i.test(t.columns[ci].label.trim())) continue;
    const vals = t.rows
      .filter((r, ri) => ri !== t.totalRow && !(h.mode === "minmax" && nCol >= 0 && typeof r[nCol] === "number" && (r[nCol] as number) < SMALL_N))
      .map((r) => r[ci])
      .filter((v): v is number => typeof v === "number");
    if (!vals.length) continue;
    stats.set(ci, { min: Math.min(...vals), max: Math.max(...vals), absMax: Math.max(...vals.map(Math.abs)) || 1 });
  }
  return {
    style(ci: number, v: CellValue, small: boolean): { css: React.CSSProperties; mark?: string } | undefined {
      const s = stats.get(ci);
      if (!s || typeof v !== "number") return undefined;
      if (h.mode === "diverging") {
        if (v === 0) return undefined;
        const k = Math.min(Math.abs(v) / s.absMax, 1);
        const rgb = v > 0 ? "91,155,255" : "249,115,22";
        return { css: { background: `rgba(${rgb},${0.08 + 0.42 * k})` }, mark: v > 0 ? " (above)" : " (below)" };
      }
      if (h.mode === "minmax") {
        if (small || s.max === s.min) return undefined;
        if (v === s.max) return { css: { background: "rgba(62,207,142,0.25)" }, mark: " (highest)" };
        if (v === s.min) return { css: { background: "rgba(246,179,82,0.25)" }, mark: " (lowest)" };
        return undefined;
      }
      const k = s.max === s.min ? 0 : (v - Math.min(0, s.min)) / (s.max - Math.min(0, s.min));
      return k > 0 ? { css: { background: `rgba(91,155,255,${0.04 + 0.5 * k})` } } : undefined;
    },
  };
}

function cmp(a: CellValue, b: CellValue): number {
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ru", { numeric: true });
}

function downloadCsv(t: TableSection) {
  const lines = [t.columns.map((c) => csvValue(c.label, { kind: "text" })).join(",")];
  for (const r of t.rows) lines.push(r.map((v, i) => csvValue(v, t.columns[i].format)).join(","));
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${t.id}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ─── Ranked bars with verbatim quotes ──────────────────────────── */

export function RankedBars({ t, v }: { t: TableSection; v: Extract<TableView, { type: "ranked" }> }) {
  const tr = useT();
  const rows = t.rows.filter((_, i) => i !== t.totalRow);
  const max = Math.max(...rows.map((r) => (typeof r[v.value] === "number" ? (r[v.value] as number) : 0)), 1);
  const rankCol = t.columns.findIndex((c) => /^(rank|#)$/i.test(c.label));
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => {
        const val = typeof r[v.value] === "number" ? (r[v.value] as number) : 0;
        const quote = v.quote !== undefined ? r[v.quote] : null;
        const share = v.share !== undefined ? r[v.share] : null;
        return (
          <li key={i} className="text-sm">
            <div className="flex items-baseline gap-3">
              <span className="num w-6 shrink-0 text-right text-xs text-ink-faint">{rankCol >= 0 ? formatValue(r[rankCol], t.columns[rankCol].format) : i + 1}</span>
              <span className="min-w-0 flex-1 text-ink">{String(r[v.label] ?? "—")}</span>
              <span className="num shrink-0 text-ink">{formatValue(r[v.value], t.columns[v.value].format)}</span>
              {share !== null && share !== undefined && (
                <span className="num w-14 shrink-0 text-right text-xs text-ink-muted">{formatValue(share, t.columns[v.share!].format)}</span>
              )}
            </div>
            <div className="ml-9 mt-1 h-1.5 overflow-hidden rounded-full bg-bg-hover" aria-hidden>
              <div className="h-full rounded-full bg-clicks" style={{ width: `${(val / max) * 100}%` }} />
            </div>
            {typeof quote === "string" && quote && (
              <details className="ml-9 mt-1.5 group">
                <summary className="cursor-pointer select-none text-xs text-ink-faint hover:text-ink-muted">{tr("Example answer")}</summary>
                <blockquote className="mt-1.5 border-l-2 border-line pl-3 text-sm italic text-ink-muted">{quote}</blockquote>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ─── Segment tables behind a switcher ──────────────────────────── */

export function SegmentSwitcher({ tables }: { tables: TableSection[] }) {
  const tr = useT();
  const [i, setI] = useState(0);
  const t = tables[i];
  const heatView = t.views.find((v) => v.type === "heat") as Extract<TableView, { type: "heat" }> | undefined;
  return (
    <div>
      <div role="tablist" aria-label={tr("Segment")} className="mb-4 flex flex-wrap gap-1.5 print:hidden">
        {tables.map((s, j) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={i === j}
            onClick={() => setI(j)}
            className={cn("rounded-full px-3.5 py-1.5 text-sm transition", i === j ? "bg-accent text-black" : "bg-bg-raised text-ink-muted hover:text-ink")}
          >
            {readableTitle(s.title)}
          </button>
        ))}
      </div>
      <DataTable t={t} heat={{ from: heatView?.from ?? 1, to: t.columns.length - 1, mode: "minmax" }} smallSamples />
      {t.note && <p className="mt-2 text-xs text-ink-faint">{t.note}</p>}
    </div>
  );
}

/* ─── HHI concentration meter ───────────────────────────────────── */

export function ConcentrationMeter({ t, v }: { t: TableSection; v: Extract<TableView, { type: "concentration" }> }) {
  const tr = useT();
  const SCALE = 0.5;
  return (
    <ul className="space-y-4">
      {t.rows.map((r, i) => {
        const hhi = typeof r[v.value] === "number" ? (r[v.value] as number) : null;
        const status = v.status !== undefined ? String(r[v.status] ?? "") : "";
        return (
          <li key={i}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="text-ink">{String(r[v.label])}</span>
              <span className="flex items-center gap-2">
                <span className="num text-ink-muted">HHI {hhi === null ? "—" : hhi.toFixed(3)}</span>
                {status && <span className={cn("pill", badgeClass(status) ?? "bg-bg-hover text-ink-muted")}>{status}</span>}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-bg-hover" role="meter" aria-valuemin={0} aria-valuemax={SCALE} aria-valuenow={hhi ?? 0} aria-label={`HHI ${String(r[v.label])}`}>
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-leads via-accent to-danger" style={{ width: `${Math.min((hhi ?? 0) / SCALE, 1) * 100}%` }} />
              {[0.15, 0.25].map((x) => (
                <span key={x} className="absolute inset-y-[-3px] w-px bg-ink-muted/60" style={{ left: `${(x / SCALE) * 100}%` }} aria-hidden />
              ))}
            </div>
          </li>
        );
      })}
      <li className="flex justify-between text-[11px] text-ink-faint" aria-hidden>
        <span>0 · {tr("low")}</span><span>0.15</span><span>0.25 · {tr("high")}</span><span>0.5+</span>
      </li>
    </ul>
  );
}
