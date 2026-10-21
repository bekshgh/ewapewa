"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import type { QueryResult } from "@/lib/projects/filters/engine";
import {
  FILTERS,
  FILTER_BY_KEY,
  GROUP_LABEL,
  PRESETS,
  SORTS,
  type FilterDef,
  type FilterGroup,
  type Option,
} from "@/lib/projects/filters/registry";
import {
  MAX_COMPARE,
  activeKeys,
  emptyState,
  toQuery,
  withValue,
  type DateRange,
  type FilterState,
  type FilterValue,
  type Range,
} from "@/lib/projects/filters/state";
import type { ProjectRow } from "@/lib/projects/rows";
import { cn } from "@/lib/utils";
import { chipText } from "./format";
import { BooleanSwitch, MultiSelect, PeriodControl, Popover, RangeControl } from "./FilterWidgets";
import { ComparePanel, ProjectList } from "./ProjectList";
import { useLang, useT } from "@/lib/i18n/client";
import { plural } from "@/lib/i18n";

export interface SavedViewItem {
  id: string;
  name: string;
  query: string;
}

const PANEL_GROUPS: FilterGroup[] = ["context", "scale", "results", "acquisition", "relative", "admin"];
const MAIN_IN_BAR = new Set(["type", "date", "season", "status", "data"]);


export function ProjectsExplorer({
  state: initial,
  result,
  types,
  views,
  compareRows,
}: {
  state: FilterState;
  result: QueryResult;
  types: Option[];
  views: SavedViewItem[];
  compareRows: ProjectRow[];
}) {
  const t = useT();
  const lang = useLang();
  const projectsWord = (n: number) => plural(lang, n, "проект", "проекта", "проектов", "project", "projects");
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState(false);
  // A shared link that already picks 2+ projects (e.g. after a bulk upload) opens the comparison.
  const [showCompare, setShowCompare] = useState(initial.cmp.length >= 2);
  const [search, setSearch] = useState((initial.values.q as string) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // On phones the panel is a bottom sheet. The page wrapper keeps a transform from
  // its entry animation, which would pin `position: fixed` to the wrapper, so the
  // sheet is portalled to <body> there.
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // The server re-renders on every URL change; keep local state in sync with it.
  useEffect(() => {
    setState(initial);
    setSearch((initial.values.q as string) ?? "");
  }, [initial]);

  const push = (next: FilterState, delay = 0) => {
    setState(next);
    clearTimeout(timer.current);
    const go = () => startTransition(() => router.push(`${pathname}${toQuery(next) ? `?${toQuery(next)}` : ""}`, { scroll: false }));
    if (delay) timer.current = setTimeout(go, delay);
    else go();
  };
  const set = (key: string, v: FilterValue | null, delay = 0) => push(withValue(state, key, v), delay);

  const small = useMemo(() => new Set(result.smallSampleIds), [result.smallSampleIds]);
  const labelFor = (key: string) => (value: string) => result.facets[key]?.find((o) => o.value === value)?.label ?? value;
  const active = activeKeys(state);
  const selectedTypes = (state.values.type as string[] | undefined) ?? [];
  const typeName = (k: string) => types.find((t) => t.value === k)?.label ?? k;
  const currentQuery = toQuery({ ...state, sort: emptyState().sort, view: "cards", cmp: [], nulls: false });

  /* which panel filters to show, by project type */
  const shown = (f: FilterDef) => f.group !== "presets" && f.kind !== "search" && (result.available[f.key] || state.values[f.key] !== undefined);
  const forTypes = (f: FilterDef) => f.appliesTo === "all" || selectedTypes.some((t) => (f.appliesTo as string[]).includes(t));
  const panelFilters = FILTERS.filter((f) => !MAIN_IN_BAR.has(f.key) && shown(f) && (f.key in result.facets || f.key in result.histograms));
  const typeSpecificFirst = selectedTypes.length === 1 ? panelFilters.filter((f) => f.appliesTo !== "all" && forTypes(f)) : [];
  const otherTypes = panelFilters.filter((f) => f.appliesTo !== "all" && !(selectedTypes.length === 1 && forTypes(f)));
  const general = panelFilters.filter((f) => f.appliesTo === "all");
  const panelActive = active.filter((k) => !MAIN_IN_BAR.has(k) && FILTER_BY_KEY.get(k)?.group !== "presets" && k !== "q").length;

  const widget = (f: FilterDef) => {
    const v = state.values[f.key];
    switch (f.kind) {
      case "multiselect":
      case "tags":
      case "relative":
        return <MultiSelect key={f.key} def={f} options={result.facets[f.key] ?? []} selected={(v as string[]) ?? []} onChange={(x) => set(f.key, x)} searchable={f.kind === "tags"} />;
      case "range":
        return <RangeControl key={f.key} def={f} value={v as Range | undefined} histogram={result.histograms[f.key] ?? null} onChange={(x) => set(f.key, x, 300)} />;
      case "boolean":
        return <BooleanSwitch key={f.key} def={f} on={v === true} count={result.facets[f.key]?.[0]?.count} onChange={(on) => set(f.key, on ? true : null)} />;
      default:
        return null;
    }
  };

  const groupBlocks = (list: FilterDef[]) =>
    PANEL_GROUPS.map((g) => {
      const fs = list.filter((f) => f.group === g);
      if (!fs.length) return null;
      return (
        <fieldset key={g} className="min-w-0 space-y-4 rounded-xl border border-line p-4">
          <legend className="px-1 font-display text-sm font-semibold text-ink">{t(GROUP_LABEL[g])}</legend>
          {fs.map(widget)}
        </fieldset>
      );
    });

  /* saved views */
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  async function saveView(e: React.FormEvent) {
    e.preventDefault();
    if (!viewName.trim()) return;
    const res = await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: viewName.trim(), query: toQuery({ ...state, cmp: [] }) }),
    }).catch(() => null);
    if (res?.ok) {
      setSaving(false);
      setViewName("");
      router.refresh();
    }
  }
  async function deleteView(id: string) {
    await fetch(`/api/views/${id}`, { method: "DELETE" }).catch(() => null);
    router.refresh();
  }

  const go = (query: string) => startTransition(() => router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false }));
  const pick = (slug: string) =>
    push({ ...state, cmp: state.cmp.includes(slug) ? state.cmp.filter((s) => s !== slug) : [...state.cmp, slug].slice(0, MAX_COMPARE) });

  return (
    <div>
      {/* ─── search + main filters ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">{t("Search projects")}</span>
          <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">⌕</span>
          <input
            type="search"
            className="input rounded-full pl-9"
            placeholder={t("Search projects…")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              set("q", e.target.value.trim() || null, 300);
            }}
          />
        </label>
        <Popover label={t("Type")} badge={selectedTypes.length || undefined}>
          {widget(FILTER_BY_KEY.get("type")!)}
        </Popover>
        <Popover label={t("Period")} badge={(state.values.date ? 1 : 0) + ((state.values.season as string[] | undefined)?.length ?? 0) || undefined} wide>
          <PeriodControl
            value={state.values.date as DateRange | undefined}
            onChange={(v) => set("date", v, v && !v.preset ? 400 : 0)}
            seasons={result.facets.season ?? []}
            selectedSeasons={(state.values.season as string[]) ?? []}
            onSeasons={(v) => set("season", v)}
          />
        </Popover>
        <Popover label={t("Status")} badge={(state.values.status as string[] | undefined)?.length || undefined}>
          {widget(FILTER_BY_KEY.get("status")!)}
        </Popover>
        <Popover label={t("Data")} badge={(state.values.data as string[] | undefined)?.length || undefined}>
          {widget(FILTER_BY_KEY.get("data")!)}
        </Popover>
        <button
          type="button"
          aria-expanded={panel}
          aria-controls="more-filters"
          onClick={() => setPanel((v) => !v)}
          className={cn("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition", panelActive ? "border-accent/50 bg-accent/10 text-ink" : "border-line bg-bg-raised text-ink-muted hover:text-ink")}
        >
          {t("More filters")}{panelActive ? ` (${panelActive})` : ""}
        </button>
      </div>

      {/* ─── quick views ───────────────────────────────────── */}
      <nav aria-label={t("Quick views")} className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="mr-1 text-xs text-ink-faint">{t("Quick views:")}</span>
        {PRESETS.map((p) => {
          const on = p.query === currentQuery;
          const def = FILTER_BY_KEY.get(p.key);
          return (
            <button key={p.key} type="button" aria-pressed={on} title={def?.help && t(def.help)} onClick={() => go(p.query)}
              className={cn("rounded-full px-3 py-1.5 text-xs transition", on ? "bg-accent text-black" : "bg-bg-raised text-ink-muted hover:text-ink")}>
              {t(p.label)}
            </button>
          );
        })}
        {views.map((v) => (
          <span key={v.id} className={cn("inline-flex items-center rounded-full text-xs", v.query === toQuery({ ...state, cmp: [] }) ? "bg-accent text-black" : "bg-bg-raised text-ink-muted")}>
            <button type="button" className="py-1.5 pl-3 pr-1.5 hover:text-ink" onClick={() => go(v.query)}>★ {v.name}</button>
            <button type="button" className="py-1.5 pr-2.5 opacity-60 hover:opacity-100" aria-label={t("Delete view “{name}”", { name: v.name })} onClick={() => deleteView(v.id)}>✕</button>
          </span>
        ))}
        {saving ? (
          <form onSubmit={saveView} className="inline-flex items-center gap-1">
            <input autoFocus className="input w-44 rounded-full py-1 text-xs" placeholder={t("View name")} value={viewName} maxLength={60}
              onChange={(e) => setViewName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setSaving(false)} aria-label={t("View name")} />
            <button type="submit" className="rounded-full bg-accent px-3 py-1.5 text-xs text-black">{t("Save")}</button>
          </form>
        ) : (
          active.length > 0 && (
            <button type="button" className="rounded-full border border-dashed border-line px-3 py-1.5 text-xs text-ink-faint hover:text-ink" onClick={() => setSaving(true)}>
              + {t("Save view")}
            </button>
          )
        )}
      </nav>

      {/* ─── active chips ──────────────────────────────────── */}
      {active.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label={t("Active filters")}>
          {active.map((k) => {
            const f = FILTER_BY_KEY.get(k)!;
            return (
              <span key={k} className="inline-flex items-center gap-1 rounded-full border border-line bg-bg-raised py-1 pl-3 pr-1 text-xs text-ink">
                {chipText(f, state.values[k], labelFor(k), lang)}
                <button type="button" className="grid h-5 w-5 place-items-center rounded-full text-ink-faint hover:bg-bg-hover hover:text-ink" aria-label={t("Remove filter: {name}", { name: t(f.label) })}
                  onClick={() => (k === "q" ? (setSearch(""), set("q", null)) : set(k, null))}>
                  ✕
                </button>
              </span>
            );
          })}
          <button type="button" className="ml-1 text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline" onClick={() => (setSearch(""), go(""))}>
            {t("Reset all")}
          </button>
        </div>
      )}

      {/* ─── more filters: side panel on desktop, bottom sheet on mobile ─── */}
      {panel && ((sheet: React.ReactNode) => (mobile ? createPortal(sheet, document.body) : sheet))(
        <>
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-hidden onClick={() => setPanel(false)} />
          <section
            id="more-filters"
            aria-label={t("More filters")}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-line bg-bg-card p-4 shadow-card lg:static lg:z-auto lg:mt-4 lg:max-h-none lg:rounded-2xl lg:p-5"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" aria-hidden />
            {typeSpecificFirst.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">{t("For type “{name}”", { name: typeName(selectedTypes[0]) })}</p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{groupBlocks(typeSpecificFirst)}</div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{groupBlocks(general)}</div>
            {otherTypes.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
                  {selectedTypes.length === 1 ? t("For other types") : t("Only for some types")}
                </p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {otherTypes.map((f) => (
                    <fieldset key={f.key} className="min-w-0 rounded-xl border border-dashed border-line p-4">
                      <legend className="px-1 text-[11px] text-ink-faint">{(f.appliesTo as string[]).map(typeName).join(", ")}</legend>
                      {widget(f)}
                    </fieldset>
                  ))}
                </div>
              </div>
            )}
            <div className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-bg-card px-4 pb-1 pt-3 lg:hidden">
              <button type="button" className="btn-primary w-full" onClick={() => setPanel(false)}>
                {t("Show {n} {word}", { n: result.matched, word: projectsWord(result.matched) })}
              </button>
            </div>
          </section>
        </>,
      )}

      {/* ─── summary, sort, view ───────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm text-ink-muted" aria-live="polite" aria-atomic="true">
          {t("Found")} <strong className="text-ink">{result.matched}</strong> {t("of {n}", { n: result.total })}
          {result.hiddenNoData > 0 && (
            <>
              {" · "}{t("{n} hidden with no data for this filter", { n: result.hiddenNoData })}{" "}
              <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => push({ ...state, nulls: true })}>
                {t("Show")}
              </button>
            </>
          )}
          {state.nulls && (
            <>
              {" · "}
              <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => push({ ...state, nulls: false })}>
                {t("Hide projects without data")}
              </button>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-faint">
            {t("Sort")}
            <select className="input w-auto py-1.5 text-xs" value={`${state.sort.dir === -1 ? "-" : ""}${state.sort.key}`}
              onChange={(e) => push({ ...state, sort: { key: e.target.value.replace(/^-/, ""), dir: e.target.value.startsWith("-") ? -1 : 1 } })}>
              {SORTS.flatMap((s) =>
                s.key === "name"
                  ? [<option key="name" value="name">{t(s.label)} (A–Z)</option>]
                  : [<option key={`-${s.key}`} value={`-${s.key}`}>{t(s.label)} ↓</option>, <option key={s.key} value={s.key}>{t(s.label)} ↑</option>],
              )}
            </select>
          </label>
          <div role="group" aria-label={t("List view")} className="inline-flex rounded-full border border-line bg-bg-raised p-0.5">
            {(["cards", "table"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={state.view === v} onClick={() => push({ ...state, view: v })}
                className={cn("rounded-full px-3 py-1 text-xs", state.view === v ? "bg-bg-hover text-ink" : "text-ink-muted")}>
                {v === "cards" ? "▦ " + t("cards") : "☰ " + t("table")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── compare bar & panel ───────────────────────────── */}
      {state.cmp.length > 0 && (
        <div className="sticky top-2 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-bg-card/95 px-4 py-3 text-sm shadow-card backdrop-blur">
          <span>{t("Selected to compare:")} <strong>{state.cmp.length}</strong> {t("of {n}", { n: MAX_COMPARE })}</span>
          <button type="button" className="btn-primary py-1.5 text-xs" disabled={state.cmp.length < 2} onClick={() => setShowCompare(true)}>
            {t("Compare")}
          </button>
          <button type="button" className="text-xs text-ink-faint hover:text-ink" onClick={() => (setShowCompare(false), push({ ...state, cmp: [] }))}>{t("Clear")}</button>
          {state.cmp.length < 2 && <span className="text-xs text-ink-faint">{t("Pick at least one more project")}</span>}
        </div>
      )}
      {showCompare && compareRows.length >= 2 && (
        <div className="mt-4">
          <ComparePanel rows={compareRows} small={small} onRemove={pick} onClose={() => setShowCompare(false)} />
        </div>
      )}

      {/* ─── results ───────────────────────────────────────── */}
      <div className={cn("mt-5 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        {result.matched === 0 ? (
          <div className="card px-6 py-12 text-center">
            <h2 className="font-display text-lg font-semibold">{t("Nothing found")}</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {result.hiddenNoData > 0
                ? t("{n} {word} hidden because they have no data for the selected filters.", { n: result.hiddenNoData, word: projectsWord(result.hiddenNoData) })
                : t("No project matches all the filters at once.")}
            </p>
            {result.emptyHints.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {result.emptyHints.slice(0, 4).map((h) => (
                  <button key={h.key} type="button" className="btn-ghost py-1.5 text-xs" onClick={() => (h.key === "q" && setSearch(""), set(h.key, null))}>
                    {t("Remove “{name}” (+{n})", { name: t(h.label), n: h.gain })}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ProjectList rows={result.items} view={state.view} small={small} picked={state.cmp} onPick={pick} />
        )}
      </div>
    </div>
  );
}
