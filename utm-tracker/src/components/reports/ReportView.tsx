"use client";

import { useEffect, useState } from "react";
import type {
  CalloutSection,
  DefinitionsSection,
  KpiSection,
  ReportDocument,
  Section,
  SheetDoc,
  TableSection,
  TableView,
} from "@/lib/reports/types";
import { cn } from "@/lib/utils";
import { CONFIGS, type ViewRule } from "@/lib/reports/configs";
import { viewsFor } from "@/lib/reports/autoViews";
import { formatValue, readableTitle } from "./format";
import { BarsChart, DoughnutChart, LineSeriesChart, describeChart } from "./ReportCharts";
import { ConcentrationMeter, DataTable, RankedBars, SegmentSwitcher } from "./ReportTables";
import { useLang, useT } from "@/lib/i18n/client";

const TYPE_LABEL = { feedback: "Feedback", registration: "Registration" } as const;

/**
 * Interactive report page body. Rendered from the ReportDocument only; tabs are
 * mirrored to ?tab= so a tab can be linked directly.
 */
export function ReportView({ doc, initialTab }: { doc: ReportDocument; initialTab?: string }) {
  const tr = useT();
  const lang = useLang();
  const keys = doc.sheets.map((s) => s.key);
  const [tab, setTab] = useState(initialTab && keys.includes(initialTab) ? initialTab : keys[0]);
  const [printAll, setPrintAll] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === tab) return;
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }, [tab]);

  // On narrow screens the tab bar scrolls: keep the active tab in view.
  useEffect(() => {
    const el = document.getElementById(`tab-${tab}`);
    const bar = el?.closest("nav");
    if (el && bar) bar.scrollLeft = el.offsetLeft - (bar.clientWidth - el.clientWidth) / 2;
  }, [tab]);

  useEffect(() => {
    if (!printAll) return;
    const done = () => setPrintAll(false);
    window.addEventListener("afterprint", done);
    const id = window.setTimeout(() => window.print(), 300); // let charts lay out first
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("afterprint", done);
    };
  }, [printAll]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the URL is in the address bar anyway */
    }
  };

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -1;
    if (next < 0 || next >= keys.length) return;
    e.preventDefault();
    setTab(keys[next]);
    document.getElementById(`tab-${keys[next]}`)?.focus();
  };

  const visible = printAll ? doc.sheets : doc.sheets.filter((s) => s.key === tab);
  // Tab names come from the current config (stored documents may carry older labels).
  const tabLabel = (s: SheetDoc) => tr(CONFIGS[doc.type]?.sheets.find((c) => c.key === s.key)?.label ?? s.label);

  return (
    <div className="report">
      <header className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="pill bg-accent/15 text-accent">{tr(TYPE_LABEL[doc.type])}</span>
          {doc.meta.period && <span className="pill bg-bg-hover text-ink-muted">{doc.meta.period}</span>}
          {doc.meta.sampleSize !== undefined && (
            <span className="pill bg-bg-hover text-ink-muted">n = {doc.meta.sampleSize.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}</span>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-[32px] sm:leading-tight">{doc.title}</h1>
        {doc.subtitle && <p className="mt-1.5 text-sm text-ink-muted">{doc.subtitle}</p>}
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          <button type="button" className="btn-ghost py-2 text-xs" onClick={copyLink}>
            {copied ? tr("Link copied") : tr("Copy link")}
          </button>
          <button type="button" className="btn-ghost py-2 text-xs" onClick={() => window.print()}>
            {tr("Print tab")}
          </button>
          <button type="button" className="btn-ghost py-2 text-xs" onClick={() => setPrintAll(true)}>
            {tr("Print / PDF whole report")}
          </button>
        </div>
      </header>

      <nav className="-mx-4 mb-6 overflow-x-auto px-4 print:hidden sm:mx-0 sm:px-0">
        <div role="tablist" aria-label={tr("Report sections")} className="inline-flex min-w-max gap-1 rounded-full border border-line bg-bg-raised p-1">
          {doc.sheets.map((s, i) => (
            <button
              key={s.key}
              id={`tab-${s.key}`}
              role="tab"
              aria-selected={tab === s.key}
              aria-controls={`panel-${s.key}`}
              tabIndex={tab === s.key ? 0 : -1}
              onClick={() => setTab(s.key)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition",
                tab === s.key ? "bg-bg-hover font-medium text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {tabLabel(s)}
            </button>
          ))}
        </div>
      </nav>

      {visible.map((s) => (
        <div key={s.key} id={`panel-${s.key}`} role="tabpanel" aria-labelledby={`tab-${s.key}`} className="mb-10">
          {printAll && <h2 className="mb-4 font-display text-xl font-bold">{tabLabel(s)}</h2>}
          <SheetPanel sheet={s} doc={doc} />
        </div>
      ))}
    </div>
  );
}

/** The config rule that draws this table now, if any. */
function ruleFor(doc: ReportDocument, sheet: SheetDoc, s: Section): ViewRule | undefined {
  if (s.kind !== "table") return undefined;
  return CONFIGS[doc.type]?.views.find((r) => r.sheet === sheet.key && r.title.test(s.title));
}

function SheetPanel({ sheet, doc }: { sheet: SheetDoc; doc: ReportDocument }) {
  const tr = useT();
  let sections = sheet.sections;
  if (sheet.key === "overview") {
    // First screen: headline numbers, then the key conclusions, then details.
    const rank = (s: Section) => (s.kind === "kpiGroup" ? 0 : s.kind === "callouts" ? 1 : 2);
    sections = [...sections].sort((a, b) => rank(a) - rank(b));
  }

  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.kind === "table" && s.views[0]?.type === "segments") {
      const group: TableSection[] = [];
      while (i < sections.length && sections[i].kind === "table" && (sections[i] as TableSection).views[0]?.type === "segments") {
        group.push(sections[i] as TableSection);
        i++;
      }
      i--;
      blocks.push(
        <Card key={s.id} title={tr("Scores by segment")} subtitle={tr("Colour compares segments within each column")}>
          <SegmentSwitcher tables={group} />
        </Card>,
      );
      continue;
    }
    blocks.push(<SectionCard key={s.id} s={s} hero={sheet.key === "overview" && i === 0} rule={ruleFor(doc, sheet, s)} />);
    if (sheet.key === "overview" && s.kind === "kpiGroup" && sections[i + 1]?.kind !== "kpiGroup") {
      const caveats = doc.methodology.find((m) => /CAVEAT/i.test(m.title));
      if (caveats) blocks.push(<Caveats key="caveats" s={caveats} />);
    }
  }
  if (blocks.length === 0) return <p className="text-sm text-ink-faint">{tr("No data was found in this part of the file.")}</p>;
  return <div className="space-y-6">{blocks}</div>;
}

function Card({ title, subtitle, children, id }: { title: string; subtitle?: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="card break-inside-avoid p-5 sm:p-6" aria-labelledby={id}>
      <h2 id={id} className="font-display text-lg font-semibold leading-snug">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SectionCard({ s, hero, rule }: { s: Section; hero?: boolean; rule?: ViewRule }) {
  const title = readableTitle(s.title);
  const sub = s.subtitle ? readableTitle(s.subtitle) : undefined;
  const id = `h-${s.id}`;
  switch (s.kind) {
    case "kpiGroup":
      return <Card id={id} title={title} subtitle={sub}><KpiGrid s={s} hero={hero} /></Card>;
    case "callouts":
      return <Card id={id} title={title} subtitle={sub}><Callouts s={s} /></Card>;
    case "definitions":
      return <Card id={id} title={title} subtitle={sub}><Definitions s={s} /></Card>;
    case "table":
      return <Card id={id} title={title} subtitle={sub}><TableBlock t={s} rule={rule} /></Card>;
  }
}

/* ─── KPI cards ─────────────────────────────────────────────────── */

const TONE_TEXT = { neutral: "text-ink", good: "text-leads", warn: "text-accent", critical: "text-danger" } as const;

function KpiGrid({ s, hero }: { s: KpiSection; hero?: boolean }) {
  const tr = useT();
  return (
    <div className={cn("grid gap-3", hero ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6")}>
      {s.cards.map((c, i) => (
        <div key={i} className="rounded-xl border border-line bg-bg-raised/60 p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{readableTitle(c.label)}</p>
          <p className={cn("num mt-1.5 font-bold tracking-tight", hero ? "text-3xl" : "text-2xl", TONE_TEXT[c.tone ?? "neutral"])}>
            {formatValue(c.value, c.format)}
          </p>
          <KpiMeter c={c} />
          {c.subtext && (
            <p className={cn("mt-1 text-xs", c.tone === "warn" ? "text-accent" : "text-ink-muted")}>
              {c.tone === "warn" && <span aria-label={tr("warning")}>⚠ </span>}
              {c.subtext}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** A thin bar under a share (0–100%) or a score out of 10, so the size reads at a glance. */
function KpiMeter({ c }: { c: KpiSection["cards"][number] }) {
  if (typeof c.value !== "number") return null;
  let k: number | null = null;
  if (c.format.kind === "percent" && c.value >= 0 && c.value <= 1) k = c.value;
  else if (c.format.kind === "number" && c.value > 0 && c.value <= 10 && (/\/\s*10/.test(c.format.unit ?? "") || /score|organi[sz]ation|composite|rating|оценк/i.test(c.label))) k = c.value / 10;
  if (k === null) return null;
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-hover" aria-hidden>
      <div className={cn("h-full rounded-full", c.tone === "warn" ? "bg-accent" : c.tone === "critical" ? "bg-danger" : "bg-clicks")} style={{ width: `${Math.max(k * 100, 2)}%` }} />
    </div>
  );
}

/* ─── Callouts & definitions ────────────────────────────────────── */

const CALLOUT = {
  info: { icon: "▸", cls: "border-clicks/30 bg-clicks/5", iconCls: "text-clicks", sr: "insight" },
  good: { icon: "✓", cls: "border-leads/30 bg-leads/5", iconCls: "text-leads", sr: "strength" },
  warn: { icon: "⚠", cls: "border-accent/40 bg-accent/5", iconCls: "text-accent", sr: "weak spot" },
  critical: { icon: "!", cls: "border-danger/40 bg-danger/5", iconCls: "text-danger", sr: "critical" },
} as const;

function Callouts({ s }: { s: CalloutSection }) {
  const tr = useT();
  return (
    <ul className="grid gap-2.5 md:grid-cols-2">
      {s.items.map((it, i) => {
        const st = CALLOUT[it.tone];
        return (
          <li key={i} className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", st.cls)}>
            <span className={cn("mt-0.5 shrink-0 font-bold", st.iconCls)} aria-hidden>{st.icon}</span>
            <span className="sr-only">{tr(st.sr)}: </span>
            <span>
              {it.label && <strong className="block font-semibold text-ink">{it.label}</strong>}
              <span className="text-ink-muted">{it.text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Definitions({ s }: { s: DefinitionsSection }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {s.items.map((d, i) => (
        <div key={i} className="grid gap-1 py-2.5 sm:grid-cols-[200px_1fr] sm:gap-4">
          <dt className="font-medium text-ink">{d.term}</dt>
          <dd className="text-ink-muted">{d.definition}</dd>
        </div>
      ))}
    </dl>
  );
}

function Caveats({ s }: { s: DefinitionsSection }) {
  const tr = useT();
  return (
    <section className="card border-accent/30 p-5 sm:p-6" aria-labelledby="h-caveats">
      <h2 id="h-caveats" className="font-display text-lg font-semibold">{tr("How to read these numbers")}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {s.items.map((d, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-bold text-accent" aria-hidden>⚠</span>
            <span><strong className="font-semibold text-ink">{d.term}.</strong> <span className="text-ink-muted">{d.definition}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─── Tables with their charts ──────────────────────────────────── */

const CHART_VIEWS = new Set<TableView["type"]>(["bars", "line", "doughnut"]);

function TableBlock({ t: source, rule }: { t: TableSection; rule?: ViewRule }) {
  const tr = useT();
  // today's config rule for this table (stored reports keep the views of the day they were read),
  // and a chart picked from the table's shape where the config leaves it plain
  const views = viewsFor(rule ? { ...source, views: rule.views(source) } : source);
  const t = views === source.views ? source : { ...source, views };
  const charts = t.views.filter((v) => CHART_VIEWS.has(v.type));
  const primary = t.views.find((v) => !CHART_VIEWS.has(v.type));

  const main = (() => {
    if (!primary) return null;
    switch (primary.type) {
      case "ranked":
        return <RankedBars t={t} v={primary} />;
      case "concentration":
        return <ConcentrationMeter t={t} v={primary} />;
      case "heat":
        return (
          <DataTable
            t={t}
            heat={{ from: primary.from, to: primary.to ?? t.columns.length - 1, mode: primary.diverging ? "diverging" : "sequential" }}
            smallSamples
          />
        );
      default:
        return <DataTable t={t} searchable={primary.type === "table" && primary.searchable} />;
    }
  })();

  const tableOnly = primary?.type === "table" || primary?.type === "concentration";
  const secondaryTable = primary?.type === "concentration" ? t.views.find((v) => v.type === "table") : undefined;

  return (
    <div className="space-y-4">
      {charts.map((v, i) => (
        <figure key={i} role="img" aria-label={describeChart(t, v)} className="m-0">
          {v.type === "bars" && <BarsChart t={t} v={v} />}
          {v.type === "line" && <LineSeriesChart t={t} v={v} />}
          {v.type === "doughnut" && <DoughnutChart t={t} v={v} />}
        </figure>
      ))}
      {charts.length > 0 && tableOnly && primary?.type === "table" ? (
        <details className="group">
          <summary className="cursor-pointer select-none text-xs text-ink-faint hover:text-ink-muted print:hidden">{tr("Show table")}</summary>
          <div className="mt-3">{main}</div>
        </details>
      ) : (
        main
      )}
      {secondaryTable && (
        <details>
          <summary className="cursor-pointer select-none text-xs text-ink-faint hover:text-ink-muted print:hidden">{tr("Show table")}</summary>
          <div className="mt-3"><DataTable t={t} /></div>
        </details>
      )}
      {t.note && <p className="whitespace-pre-line text-xs text-ink-faint">{t.note}</p>}
    </div>
  );
}
