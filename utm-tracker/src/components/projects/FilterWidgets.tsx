"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FacetOption, Histogram } from "@/lib/projects/filters/engine";
import type { FilterDef } from "@/lib/projects/filters/registry";
import type { DateRange, Range } from "@/lib/projects/filters/state";
import { cn } from "@/lib/utils";
import { DATE_PRESET, fmtNumber, seasonText, unitText } from "./format";
import { useLang, useT } from "@/lib/i18n/client";

/* ─── "?" hint ──────────────────────────────────────────────────── */

export function Hint({ text }: { text?: string }) {
  const t = useT();
  if (!text) return null;
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button type="button" aria-label={t("What is this: {text}", { text: t(text) })} className="grid h-4 w-4 place-items-center rounded-full border border-line text-[10px] text-ink-faint hover:text-ink">
        ?
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-5 z-30 hidden w-64 -translate-x-1/2 rounded-lg border border-line bg-bg-raised p-2 text-xs font-normal normal-case tracking-normal text-ink-muted shadow-card group-focus-within:block group-hover:block">
        {t(text)}
      </span>
    </span>
  );
}

/* ─── Popover ───────────────────────────────────────────────────── */

export function Popover({ label, badge, children, wide }: { label: string; badge?: number; children: React.ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition", badge ? "border-accent/50 bg-accent/10 text-ink" : "border-line bg-bg-raised text-ink-muted hover:text-ink")}
      >
        {label}
        {badge ? <span className="num rounded-full bg-accent px-1.5 text-[11px] font-semibold text-black">{badge}</span> : null}
        <span aria-hidden className="text-[10px]">▾</span>
      </button>
      {open && (
        <div id={id} className={cn("absolute left-0 top-full z-30 mt-2 max-h-[70vh] overflow-auto rounded-2xl border border-line bg-bg-card p-4 shadow-card", wide ? "w-[340px]" : "w-[280px]")}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Multiselect with facet counts ─────────────────────────────── */

export function MultiSelect({
  def,
  options,
  selected,
  onChange,
  searchable,
}: {
  def: FilterDef;
  options: FacetOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const shown = q ? options.filter((o) => t(o.label).toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
        {t(def.label)}
        <Hint text={def.help} />
      </legend>
      {(searchable || options.length > 10) && (
        <input className="input mb-2 py-1.5 text-xs" placeholder={t("Find…")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("Search: {name}", { name: t(def.label) })} />
      )}
      <ul className="space-y-0.5">
        {shown.map((o) => {
          const checked = selected.includes(o.value);
          const muted = !checked && (o.count === 0 || o.disabled);
          return (
            <li key={o.value}>
              <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-bg-hover", muted && "text-ink-faint", o.disabled && !checked && "cursor-not-allowed")} title={o.disabled && t(o.disabled)}>
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={checked} disabled={Boolean(o.disabled) && !checked} onChange={() => toggle(o.value)} />
                <span className="flex-1">{t(o.label)}</span>
                <span className="num text-xs text-ink-faint" aria-label={t("{n} projects", { n: o.count })}>{o.count}</span>
              </label>
              {o.disabled && <p className="ml-8 text-[11px] text-ink-faint">{t(o.disabled)}</p>}
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2 py-1.5 text-xs text-ink-faint">{t("No options")}</li>}
      </ul>
    </fieldset>
  );
}

/* ─── Range with histogram, sliders and quick buckets ───────────── */

export function RangeControl({
  def,
  value,
  histogram,
  onChange,
}: {
  def: FilterDef;
  value?: Range;
  histogram: Histogram | null;
  onChange: (v: Range | null) => void;
}) {
  const t = useT();
  const lang = useLang();
  const id = useId();
  if (!histogram) {
    return (
      <fieldset>
        <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">{t(def.label)}</legend>
        <p className="text-xs text-ink-faint">{t("No projects have this metric.")}</p>
      </fieldset>
    );
  }
  const dec = def.decimals ?? 0;
  const step = dec ? 10 ** -dec : 1;
  // Scores live high (7–10): the scale follows the real range of the portfolio.
  const lo = Math.floor(histogram.min / step) * step;
  const hi = Math.ceil(histogram.max / step) * step;
  const min = value?.min ?? lo;
  const max = value?.max ?? hi;
  const u = unitText(def.unit, lang);
  const text = (x: number) => `${fmtNumber(x, dec)}${u ? ` ${u}` : ""}`;
  const peak = Math.max(...histogram.bins, 1);
  const set = (nmin: number, nmax: number) =>
    onChange(nmin <= lo && nmax >= hi ? null : { ...(nmin > lo ? { min: +nmin.toFixed(4) } : {}), ...(nmax < hi ? { max: +nmax.toFixed(4) } : {}) });

  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
        {t(def.label)}
        {u && <span className="normal-case"> ({u})</span>}
        <Hint text={def.help} />
      </legend>
      <div className="flex h-10 items-end gap-px" aria-hidden>
        {histogram.bins.map((b, i) => {
          const x0 = histogram.min + ((histogram.max - histogram.min) * i) / histogram.bins.length;
          const x1 = histogram.min + ((histogram.max - histogram.min) * (i + 1)) / histogram.bins.length;
          const inside = x1 >= min && x0 <= max;
          return <span key={i} className={cn("flex-1 rounded-t-sm", inside ? "bg-clicks/70" : "bg-bg-hover")} style={{ height: `${Math.max((b / peak) * 100, b ? 8 : 2)}%` }} />;
        })}
      </div>
      <p className="sr-only">
        {t("{n} projects with this metric, from {min} to {max}.", { n: histogram.withValue, min: text(histogram.min), max: text(histogram.max) })}
      </p>
      <div className="mt-2 space-y-1">
        <label className="flex items-center gap-2 text-xs text-ink-muted" htmlFor={`${id}-min`}>
          <span className="w-8">{t("from")}</span>
          <input id={`${id}-min`} type="range" className="flex-1 accent-accent" min={lo} max={hi} step={step} value={min}
            aria-valuetext={text(min)} onChange={(e) => set(Math.min(Number(e.target.value), max), max)} />
          <span className="num w-16 text-right text-ink">{text(min)}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-muted" htmlFor={`${id}-max`}>
          <span className="w-8">{t("to")}</span>
          <input id={`${id}-max`} type="range" className="flex-1 accent-accent" min={lo} max={hi} step={step} value={max}
            aria-valuetext={text(max)} onChange={(e) => set(min, Math.max(Number(e.target.value), min))} />
          <span className="num w-16 text-right text-ink">{text(max)}</span>
        </label>
      </div>
      {def.buckets && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {def.buckets.map((b) => {
            const on = value?.min === b.min && value?.max === b.max;
            return (
              <button key={b.label} type="button" aria-pressed={on}
                onClick={() => onChange(on ? null : { ...(b.min !== undefined ? { min: b.min } : {}), ...(b.max !== undefined ? { max: b.max } : {}) })}
                className={cn("rounded-full px-2.5 py-1 text-xs", on ? "bg-accent text-black" : "bg-bg-raised text-ink-muted hover:text-ink")}>
                {b.label}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

/* ─── Boolean switch ────────────────────────────────────────────── */

export function BooleanSwitch({ def, on, count, onChange }: { def: FilterDef; on: boolean; count?: number; onChange: (on: boolean) => void }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink">
        {t(def.label)}
        <Hint text={def.help} />
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={t(def.label)} onClick={() => onChange(!on)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-accent" : "bg-bg-hover")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} />
      </button>
      {count !== undefined && <span className="sr-only">{t("{n} projects", { n: count })}</span>}
    </div>
  );
}

/* ─── Period: presets, custom range, seasons ───────────────────── */

export function PeriodControl({
  value,
  onChange,
  seasons,
  selectedSeasons,
  onSeasons,
}: {
  value?: DateRange;
  onChange: (v: DateRange | null) => void;
  seasons: FacetOption[];
  selectedSeasons: string[];
  onSeasons: (v: string[]) => void;
}) {
  const t = useT();
  const lang = useLang();
  const id = useId();
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{t("By event date")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(DATE_PRESET).map(([k, label]) => {
            const on = value?.preset === k;
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => onChange(on ? null : { preset: k as DateRange["preset"] })}
                className={cn("rounded-full px-3 py-1.5 text-xs", on ? "bg-accent text-black" : "bg-bg-raised text-ink-muted hover:text-ink")}>
                {t(label)}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-ink-muted" htmlFor={`${id}-from`}>
            {t("From")}
            <input id={`${id}-from`} type="date" className="input mt-1 py-1.5 text-xs" value={value?.from ?? ""}
              onChange={(e) => onChange(e.target.value || value?.to ? { from: e.target.value || undefined, to: value?.to } : null)} />
          </label>
          <label className="text-xs text-ink-muted" htmlFor={`${id}-to`}>
            {t("To")}
            <input id={`${id}-to`} type="date" className="input mt-1 py-1.5 text-xs" value={value?.to ?? ""}
              onChange={(e) => onChange(e.target.value || value?.from ? { from: value?.from, to: e.target.value || undefined } : null)} />
          </label>
        </div>
      </fieldset>
      {seasons.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{t("Seasons")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {seasons.map((s) => {
              const on = selectedSeasons.includes(s.value);
              return (
                <button key={s.value} type="button" aria-pressed={on}
                  onClick={() => onSeasons(on ? selectedSeasons.filter((x) => x !== s.value) : [...selectedSeasons, s.value])}
                  className={cn("rounded-full px-3 py-1.5 text-xs", on ? "bg-accent text-black" : s.count ? "bg-bg-raised text-ink-muted hover:text-ink" : "bg-bg-raised text-ink-faint")}>
                  {seasonText(s.label, lang)} <span className="num opacity-70">{s.count}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}
