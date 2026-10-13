import type { ReportType, TableSection, TableView } from "./types";

/**
 * Per-type configuration: which sheets become which tabs (only these sheets are
 * ever read — raw-data sheets are skipped unopened), which sections we expect,
 * and how each table is drawn. Rules match section headings, never cell
 * addresses, so the next event's file with the same layout just works.
 */

export interface SheetConfig {
  key: string;
  label: string;
  match: RegExp; // against the normalised sheet name
  methodology?: boolean;
  expect?: RegExp[]; // section headings that should be present
}

export interface ViewRule {
  sheet: string; // SheetConfig.key
  title: RegExp;
  views: (t: TableSection) => TableView[];
}

export interface TypeConfig {
  type: ReportType;
  label: string;
  signature: RegExp[]; // normalised sheet names that identify the type
  sheets: SheetConfig[];
  views: ViewRule[];
}

/** Index of the first column whose label matches, or -1. */
export function col(t: TableSection, re: RegExp, from = 0): number {
  for (let i = from; i < t.columns.length; i++) if (re.test(t.columns[i].label)) return i;
  return -1;
}

const numericCols = (t: TableSection, from = 1, to = t.columns.length - 1) =>
  t.columns.map((c, i) => i).filter((i) => i >= from && i <= to && t.columns[i].format.kind !== "text");

const has = (...xs: number[]) => xs.every((x) => x >= 0);

function ranked(t: TableSection, label: RegExp, value: RegExp, share?: RegExp, quote?: RegExp): TableView[] {
  const l = col(t, label);
  const v = col(t, value);
  if (!has(l, v)) return [{ type: "table" }];
  const s = share ? col(t, share) : -1;
  const q = quote ? col(t, quote) : -1;
  return [{ type: "ranked", label: l, value: v, ...(s >= 0 ? { share: s } : {}), ...(q >= 0 ? { quote: q } : {}) }];
}

export const FEEDBACK: TypeConfig = {
  type: "feedback",
  label: "Feedback",
  signature: [/^Satisfaction & Themes$/i, /^Operational Scorecard$/i, /^Segment Analysis$/i],
  sheets: [
    { key: "overview", label: "Overview", match: /^KPI Dashboard$/i,
      expect: [/CORE EVENT METRICS/, /OPERATIONAL SCORES/, /WHO ANSWERED/, /SCORE SUMMARY/, /KEY SIGNALS/] },
    { key: "themes", label: "Themes & feedback", match: /^Satisfaction & Themes$/i,
      expect: [/SCALES/, /WHAT THEY LIKED/, /PAIN POINTS/, /REQUESTS/] },
    { key: "scorecard", label: "Operational scorecard", match: /^Operational Scorecard$/i,
      expect: [/SCORE DISTRIBUTION/, /BY UNIVERSITY/, /NETWORKING/, /SPEAKERS/] },
    { key: "segments", label: "Segments", match: /^Segment Analysis$/i,
      expect: [/UNIVERSITY/, /STUDY STAGE/, /CHANNEL/, /AIESEC/, /TIMING/] },
    { key: "patterns", label: "Patterns & outliers", match: /^Pattern(s)? & Outliers$/i,
      expect: [/FREQUENCY/, /OUTLIER/, /RELATIONSHIPS/, /RESPONSE TIMING/, /PATTERNS/] },
    { key: "methodology", label: "Methodology", match: /^Notes$/i, methodology: true },
  ],
  views: [
    { sheet: "overview", title: /SCORE SUMMARY/, views: (t) => {
      const v: TableView[] = [{ type: "table" }];
      const gap = col(t, /Gap/);
      if (gap >= 0) v[0] = { type: "heat", from: gap, diverging: true };
      const s10 = col(t, /Score \/10/);
      if (s10 >= 0) v.push({ type: "bars", label: 0, values: [s10], horizontal: true });
      return v;
    } },
    { sheet: "themes", title: /SCALES/, views: (t) => [{ type: "heat", from: 1 }] },
    { sheet: "themes", title: /LIKED|PAIN|REQUESTS/, views: (t) => ranked(t, /Theme/i, /Mentions/i, /% of resp/i, /Example/i) },
    { sheet: "scorecard", title: /SCORE DISTRIBUTION/, views: (t) => {
      const counts = numericCols(t, 1).filter((i) => !/%|Mean|Med|Score/i.test(t.columns[i].label));
      return [{ type: "table" }, { type: "bars", label: 0, values: counts, stacked: true, horizontal: true, palette: "scale" }];
    } },
    { sheet: "scorecard", title: /BY UNIVERSITY/, views: (t) => {
      const gap = col(t, /Gap/);
      return [gap >= 0 ? { type: "heat", from: gap, diverging: true } : { type: "table" }];
    } },
    { sheet: "scorecard", title: /NETWORKING|SPEAKERS/, views: (t) => ranked(t, /Format|speaker|topic/i, /Mentions/i, /% of resp/i) },
    { sheet: "segments", title: /.*/, views: (t) => [{ type: "segments" }, { type: "heat", from: Math.max(col(t, /^n$/i) + 1, 1) }] },
    { sheet: "patterns", title: /FREQUENCY/, views: (t) => {
      const counts = numericCols(t, 1).filter((i) => !/%$/.test(t.columns[i].label));
      return [{ type: "bars", label: 0, values: counts }, { type: "table" }];
    } },
    { sheet: "patterns", title: /RELATIONSHIPS/, views: (t) => {
      const r = col(t, /Correl/i);
      return r >= 0 ? [{ type: "bars", label: 0, values: [r], horizontal: true }, { type: "table" }] : [{ type: "table" }];
    } },
    { sheet: "patterns", title: /RESPONSE TIMING/, views: (t) => {
      const n = col(t, /Responses/i);
      return n >= 0 ? [{ type: "bars", label: 0, values: [n] }, { type: "table" }] : [{ type: "table" }];
    } },
  ],
};

export const REGISTRATION: TypeConfig = {
  type: "registration",
  label: "Registration",
  signature: [/^Trend Dashboard$/i, /^Channel Dashboard$/i, /^Audience Dashboard$/i],
  sheets: [
    { key: "overview", label: "Overview", match: /^KPI Dashboard$/i,
      expect: [/HEADLINE KPIs/i, /KEY SIGNALS/, /CHANNEL HEAD-TO-HEAD/] },
    { key: "trend", label: "Trend", match: /^(Trend Dashboard|Daily Trend)$/i,
      expect: [/MOMENTUM/, /DAY-BY-DAY/, /WEEKDAY/, /HOUR/] },
    { key: "channels", label: "Channels", match: /^Channel Dashboard$/i,
      expect: [/GROUP SUMMARY/, /AUDIENCE MIX/, /CHANNEL × UNIVERSITY/, /PERFORMANCE GAP/] },
    { key: "audience", label: "Audience", match: /^(Audience Dashboard|Segment Analysis)$/i,
      expect: [/WHO REGISTERED/, /STUDY LEVEL/, /UNIVERSITY/, /MAJOR/, /AGE BAND/, /HOW THEY HEARD/, /PAST AIESEC/] },
    { key: "patterns", label: "Patterns", match: /^Patterns? & Outliers$/i,
      expect: [/HEATMAP/, /BURSTINESS/, /AGE OUTLIERS/, /CONCENTRATION/, /ATTRIBUTION/] },
    { key: "tables", label: "Tables", match: /^Detailed Tables$/i, expect: [/UTM-LEVEL/] },
    { key: "methodology", label: "Methodology", match: /^Notes$/i, methodology: true },
  ],
  views: [
    { sheet: "overview", title: /HEAD-TO-HEAD/, views: (t) => {
      const regs = col(t, /^Regs$/i);
      const from = col(t, /Avg age/i);
      const v: TableView[] = [{ type: "heat", from: from >= 0 ? from : 2 }];
      if (regs >= 0) v.unshift({ type: "bars", label: 0, values: [regs], horizontal: true });
      return v;
    } },
    { sheet: "trend", title: /DAY-BY-DAY/, views: (t) => {
      const day = Math.max(col(t, /^Day$/i), 0);
      const wk = col(t, /Wkday/i);
      const total = col(t, /^Total$/i);
      const groups = wk >= 0 && total > wk ? numericCols(t, wk + 1, total - 1) : [];
      const cum = col(t, /^Cumul\.?$/i);
      const v: TableView[] = [];
      if (groups.length) v.push({ type: "bars", label: day, values: groups, stacked: true });
      if (cum >= 0) v.push({ type: "line", label: day, values: [cum] });
      v.push({ type: "table" });
      return v;
    } },
    { sheet: "trend", title: /WEEKDAY/, views: (t) => {
      const a = col(t, /Avg/i);
      return [{ type: "bars", label: 0, values: [a >= 0 ? a : 1] }, { type: "table" }];
    } },
    { sheet: "trend", title: /HOUR/, views: (t) => [{ type: "bars", label: 0, values: [Math.max(col(t, /Regs/i), 1)] }, { type: "table" }] },
    { sheet: "channels", title: /GROUP SUMMARY/, views: (t) => {
      const regs = col(t, /^Regs$/i);
      const v: TableView[] = [{ type: "heat", from: Math.max(col(t, /Avg age/i), 2) }];
      if (regs >= 0 && t.rows.length <= 8) v.unshift({ type: "doughnut", label: 0, value: regs });
      return v;
    } },
    { sheet: "channels", title: /AUDIENCE MIX/, views: (t) => [
      { type: "bars", label: 0, values: numericCols(t, 2), stacked: true, horizontal: true, percent: true },
      { type: "table" },
    ] },
    { sheet: "channels", title: /×/, views: (t) => [{ type: "heat", from: 2 }] },
    { sheet: "channels", title: /PERFORMANCE GAP/, views: (t) => [{ type: "heat", from: 2, diverging: true }] },
    { sheet: "audience", title: /.*/, views: (t) => ranked(t, /^(?!#).+/, /^Regs$/i, /Share|% of regs/i) },
    { sheet: "patterns", title: /HEATMAP/, views: (t) => [{ type: "heat", from: 1 }] },
    { sheet: "patterns", title: /AGE HISTOGRAM/, views: (t) => [{ type: "bars", label: 0, values: [Math.max(col(t, /Regs/i), 1)] }] },
    { sheet: "patterns", title: /CONCENTRATION/, views: (t) => {
      const hhi = col(t, /HHI/);
      const st = col(t, /Concentration/i);
      return hhi >= 0 ? [{ type: "concentration", label: 0, value: hhi, ...(st >= 0 ? { status: st } : {}) }, { type: "table" }] : [{ type: "table" }];
    } },
    { sheet: "patterns", title: /ATTRIBUTION|×/, views: (t) => [{ type: "heat", from: 2 }] },
    { sheet: "tables", title: /UTM-LEVEL/, views: () => [{ type: "table", searchable: true }] },
    { sheet: "tables", title: /×/, views: () => [{ type: "heat", from: 1 }, { type: "table", searchable: true }] },
  ],
};

export const CONFIGS: Record<ReportType, TypeConfig> = { feedback: FEEDBACK, registration: REGISTRATION };

/** "01 · KPI Dashboard" / "08b Raw Sheet2" → "KPI Dashboard" / "Raw Sheet2" */
export function normalizeSheetName(name: string): string {
  return name.replace(/^\s*\d+[a-z]?\s*[·.\-–]?\s*/i, "").replace(/\s+/g, " ").trim();
}

export function detectType(sheetNames: string[]): ReportType | null {
  const names = sheetNames.map(normalizeSheetName);
  const score = (c: TypeConfig) => c.signature.filter((re) => names.some((n) => re.test(n))).length;
  const all = Object.values(CONFIGS) as TypeConfig[];
  const hits = all.filter((c) => score(c) === c.signature.length);
  if (hits.length === 1) return hits[0].type;
  if (hits.length > 1) return null;
  // A sheet renamed or dropped: most of one type's signature, none of the other's.
  const most = all.filter((c) => score(c) * 2 > c.signature.length);
  return most.length === 1 && all.every((c) => c === most[0] || score(c) === 0) ? most[0].type : null;
}
