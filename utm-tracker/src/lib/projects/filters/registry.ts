import {
  CHANNEL_GROUPS,
  CONCENTRATION,
  STAGES,
  THEMES,
  ZONES,
  type DictEntry,
} from "../dictionaries";
import type { ProjectRow } from "../rows";
import { seasonLabel, seasonOrder } from "../rows";
import type { ProjectSettings } from "../settings";

/**
 * THE list of project filters. The panel UI, URL parsing / building,
 * validation, matching, facet counts, histograms and presets are all derived
 * from these entries — a new filter is one entry here (plus, if needed, a
 * ProjectMetrics column). Inside one filter values are OR-ed, filters are AND-ed.
 */

export type FilterKind = "search" | "multiselect" | "tags" | "range" | "boolean" | "dateRange" | "relative";
export type FilterGroup = "main" | "context" | "scale" | "results" | "acquisition" | "relative" | "admin" | "presets";
export type Unit = "%" | "/10" | "days" | "people" | "years";

export interface Option {
  value: string;
  label: string;
}

/** Portfolio statistics for relative filters, computed once per query. */
export interface RelativeStats {
  /** per type: sorted eligible values; absent when the type has too few projects */
  byType: Map<string, number[]>;
  /** all eligible values, sorted */
  all: number[];
}

export interface FilterCtx {
  settings: ProjectSettings;
  now: Date;
  relative: Record<string, RelativeStats>;
}

type Value = string | number | boolean | string[] | null;

export interface FilterDef {
  key: string; // also the URL parameter — short and stable
  label: string;
  group: FilterGroup;
  kind: FilterKind;
  /** Where the value comes from: a row field, or a derived getter. */
  field?: keyof ProjectRow;
  get?: (row: ProjectRow, ctx: FilterCtx) => Value;
  appliesTo: "all" | string[]; // project type keys
  nullPolicy: "exclude" | "include";
  unit?: Unit;
  /** stored value × scale = shown value (shares are stored 0..1, shown in %) */
  scale?: number;
  decimals?: number;
  visibility?: "public" | "admin";
  defaultVisible?: boolean;
  help?: string;
  /** multiselect / tags / relative options; a function derives them from the data */
  options?: Option[] | ((rows: ProjectRow[]) => Option[]);
  /** quick buckets for ranges, in shown units */
  buckets?: { label: string; min?: number; max?: number }[];
  /** relative filters: which field they compare */
  relativeOf?: keyof ProjectRow;
}

const dict = (d: DictEntry[]): Option[] => d.map((x) => ({ value: x.key, label: x.label }));
const distinct = (field: keyof ProjectRow) => (rows: ProjectRow[]): Option[] =>
  [...new Set(rows.map((r) => r[field]).filter((v): v is string => typeof v === "string" && v !== ""))]
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((v) => ({ value: v, label: v }));

export const COMPLETED = new Set(["done", "archived"]);

export const RELATIVE_OPTIONS: Option[] = [
  { value: "above_type_median", label: "Above the median of its type" },
  { value: "top25", label: "Top 25% of completed" },
  { value: "bottom25", label: "Bottom 25% of completed" },
  { value: "above_avg", label: "Above the portfolio average" },
  { value: "below_avg", label: "Below the portfolio average" },
];

/** Enough responses to trust the scores: n ≥ min AND response rate ≥ min. */
export function enoughSample(r: ProjectRow, s: ProjectSettings): boolean | null {
  if (r.responses === null || r.responseRate === null) return null;
  return r.responses >= s.minResponses && r.responseRate >= s.minResponseRate;
}

const daysSince = (iso: string | null, now: Date) => (iso ? (now.getTime() - new Date(iso).getTime()) / 86_400_000 : null);

export const FILTERS: FilterDef[] = [
  /* ─── A. main ─────────────────────────────────────────────── */
  { key: "q", label: "Search", group: "main", kind: "search", appliesTo: "all", nullPolicy: "include", defaultVisible: true,
    help: "By name, type, tags, city and team. Case-insensitive; Cyrillic and Latin both work." },
  { key: "type", label: "Project type", group: "main", kind: "multiselect", field: "typeKey", appliesTo: "all", nullPolicy: "exclude", defaultVisible: true },
  { key: "date", label: "Period", group: "main", kind: "dateRange", field: "startDate", appliesTo: "all", nullPolicy: "exclude", defaultVisible: true,
    help: "By the event date." },
  { key: "season", label: "Season", group: "main", kind: "multiselect", field: "season", appliesTo: "all", nullPolicy: "exclude", defaultVisible: true,
    options: (rows) => [...new Set(rows.map((r) => r.season).filter((s): s is string => Boolean(s)))]
      .sort((a, b) => seasonOrder(b) - seasonOrder(a))
      .map((s) => ({ value: s, label: seasonLabel(s) })) },
  { key: "status", label: "Status", group: "main", kind: "multiselect", field: "status", appliesTo: "all", nullPolicy: "exclude", defaultVisible: true,
    options: [
      { value: "planned", label: "Planned" },
      { value: "registration", label: "Registration open" },
      { value: "done", label: "Done" },
      { value: "archived", label: "Archived" },
    ] },
  { key: "data", label: "Data", group: "main", kind: "multiselect", appliesTo: "all", nullPolicy: "include", defaultVisible: true,
    help: "Which reports are uploaded for the project.",
    get: (r) => {
      const v: string[] = [];
      if (r.hasRegistrationReport) v.push("reg");
      if (r.hasFeedbackReport) v.push("fb");
      if (r.hasRegistrationReport && r.hasFeedbackReport) v.push("both");
      if (!r.hasRegistrationReport && !r.hasFeedbackReport) v.push("none");
      return v;
    },
    options: [
      { value: "reg", label: "Has registration report" },
      { value: "fb", label: "Has feedback report" },
      { value: "both", label: "Has both" },
      { value: "none", label: "No reports" },
    ] },

  /* ─── B. context ──────────────────────────────────────────── */
  { key: "format", label: "Format", group: "context", kind: "multiselect", field: "format", appliesTo: "all", nullPolicy: "exclude",
    options: [{ value: "offline", label: "Offline" }, { value: "online", label: "Online" }, { value: "hybrid", label: "Hybrid" }] },
  { key: "city", label: "City", group: "context", kind: "multiselect", field: "city", appliesTo: "all", nullPolicy: "exclude", options: distinct("city") },
  { key: "venue", label: "Venue", group: "context", kind: "multiselect", field: "venue", appliesTo: "all", nullPolicy: "exclude", options: distinct("venue") },
  { key: "team", label: "Team", group: "context", kind: "multiselect", field: "ownerTeam", appliesTo: "all", nullPolicy: "exclude", options: distinct("ownerTeam") },
  { key: "tags", label: "Tags", group: "context", kind: "tags", field: "tags", appliesTo: "all", nullPolicy: "exclude",
    options: (rows) => [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, "ru")).map((t) => ({ value: t, label: t })) },
  { key: "stage", label: "Main study stage", group: "context", kind: "multiselect", field: "audienceStage", appliesTo: "all", nullPolicy: "exclude",
    options: dict(STAGES), help: "The largest group of registrants by study stage, from the registration report." },
  { key: "age", label: "Age group", group: "context", kind: "multiselect", field: "ageBand", appliesTo: "all", nullPolicy: "exclude",
    options: distinct("ageBand"), help: "The most common age band of registrants." },

  /* ─── C. scale ────────────────────────────────────────────── */
  { key: "regs", label: "Registrations", group: "scale", kind: "range", field: "registrants", appliesTo: "all", nullPolicy: "exclude", unit: "people",
    help: "Unique registrants after removing duplicates.",
    buckets: [{ label: "<100", max: 99 }, { label: "100–300", min: 100, max: 300 }, { label: "300–600", min: 300, max: 600 }, { label: "600+", min: 600 }] },
  { key: "resp", label: "Feedback responses", group: "scale", kind: "range", field: "responses", appliesTo: "all", nullPolicy: "exclude", unit: "people" },
  { key: "rr", label: "Response rate", group: "scale", kind: "range", field: "responseRate", appliesTo: "all", nullPolicy: "exclude", unit: "%", scale: 100, decimals: 1,
    help: "Feedback responses ÷ unique registrants." },
  { key: "days", label: "Campaign length", group: "scale", kind: "range", field: "campaignDays", appliesTo: "all", nullPolicy: "exclude", unit: "days" },
  { key: "channels", label: "Channels", group: "scale", kind: "range", field: "channelCount", appliesTo: "all", nullPolicy: "exclude" },

  /* ─── D. results ──────────────────────────────────────────── */
  { key: "score10", label: "Organization score", group: "results", kind: "range", field: "orgScore10", appliesTo: "all", nullPolicy: "exclude", unit: "/10", decimals: 1 },
  { key: "nps", label: "NPS proxy", group: "results", kind: "range", field: "nps", appliesTo: "all", nullPolicy: "exclude",
    help: "An NPS-style proxy: % of 9–10 minus % of ≤6 on the organization question." },
  { key: "comp10", label: "Composite score", group: "results", kind: "range", field: "composite10", appliesTo: "all", nullPolicy: "exclude", unit: "/10", decimals: 1,
    help: "Average of all ratings, normalised to /10." },
  { key: "weak", label: "Weakest area", group: "results", kind: "multiselect", field: "weakestZone", appliesTo: "all", nullPolicy: "exclude", options: dict(ZONES),
    help: "The rated area with the lowest score in the project." },
  { key: "strong", label: "Strongest area", group: "results", kind: "multiselect", field: "strongestZone", appliesTo: "all", nullPolicy: "exclude", options: dict(ZONES) },
  { key: "praise", label: "Most praised", group: "results", kind: "multiselect", field: "topPraiseTheme", appliesTo: "all", nullPolicy: "exclude", options: dict(THEMES) },
  { key: "pain", label: "Most criticised", group: "results", kind: "multiselect", field: "topPainTheme", appliesTo: "all", nullPolicy: "exclude", options: dict(THEMES) },
  { key: "enough", label: "Only with enough responses", group: "results", kind: "boolean", appliesTo: "all", nullPolicy: "exclude",
    get: (r, ctx) => enoughSample(r, ctx.settings),
    help: "Thresholds are set in Settings (default: n ≥ 30 and at least 5% of registrants)." },

  /* ─── E. acquisition & audience ───────────────────────────── */
  { key: "channel", label: "Top channel", group: "acquisition", kind: "multiselect", field: "topChannelGroup", appliesTo: "all", nullPolicy: "exclude", options: dict(CHANNEL_GROUPS) },
  { key: "conc", label: "Single-channel dependence", group: "acquisition", kind: "multiselect", field: "concentrationLevel", appliesTo: "all", nullPolicy: "exclude",
    options: dict(CONCENTRATION), help: "HHI concentration across channel groups: <0.15 low, 0.15–0.25 moderate, >0.25 high." },
  { key: "campaign", label: "Campaign shape", group: "acquisition", kind: "multiselect", appliesTo: "all", nullPolicy: "exclude",
    get: (r) => (r.isBursty === null ? null : r.isBursty ? "burst" : "even"),
    options: [{ value: "burst", label: "Bursty" }, { value: "even", label: "Even" }],
    help: "Bursty: more than 20% of registrations came on a single day (threshold in Settings)." },
  { key: "uni", label: "Top university share", group: "acquisition", kind: "range", field: "topUniversityShare", appliesTo: "all", nullPolicy: "exclude", unit: "%", scale: 100,
    help: "Share of the most common university among registrants; the name comes from the report." },
  { key: "newbies", label: "New to AIESEC", group: "acquisition", kind: "range", field: "newToOrgShare", appliesTo: ["forum", "case_championship"], nullPolicy: "exclude", unit: "%", scale: 100 },
  { key: "intern", label: "Want an internship", group: "acquisition", kind: "range", field: "internshipShare", appliesTo: ["forum", "case_championship"], nullPolicy: "exclude", unit: "%", scale: 100 },
  { key: "avgage", label: "Average age", group: "acquisition", kind: "range", field: "avgAge", appliesTo: "all", nullPolicy: "exclude", unit: "years", decimals: 1 },
  { key: "dup", label: "Duplicate rate", group: "acquisition", kind: "range", field: "duplicateRate", appliesTo: "all", nullPolicy: "exclude", unit: "%", scale: 100, decimals: 1,
    help: "Repeat form submissions ÷ all submissions. A data-quality signal." },

  /* ─── F. relative ─────────────────────────────────────────── */
  { key: "relscore", label: "Score vs others", group: "relative", kind: "relative", relativeOf: "orgScore10", appliesTo: "all", nullPolicy: "exclude",
    options: RELATIVE_OPTIONS, help: "Compared among completed projects only; small samples are left out." },
  { key: "relnps", label: "NPS vs others", group: "relative", kind: "relative", relativeOf: "nps", appliesTo: "all", nullPolicy: "exclude", options: RELATIVE_OPTIONS },
  { key: "relrr", label: "Response rate vs others", group: "relative", kind: "relative", relativeOf: "responseRate", appliesTo: "all", nullPolicy: "exclude", options: RELATIVE_OPTIONS },

  /* ─── G. admin ────────────────────────────────────────────── */
  { key: "vis", label: "Report visibility", group: "admin", kind: "multiselect", field: "reportVisibilities", appliesTo: "all", nullPolicy: "exclude", visibility: "admin",
    options: [{ value: "private", label: "Private" }, { value: "link", label: "By link" }, { value: "public", label: "Public" }] },
  { key: "warn", label: "Has parser warnings", group: "admin", kind: "boolean", field: "hasWarnings", appliesTo: "all", nullPolicy: "exclude", visibility: "admin" },
  { key: "stale", label: "Days since report update", group: "admin", kind: "range", appliesTo: "all", nullPolicy: "exclude", visibility: "admin", unit: "days",
    get: (r, ctx) => {
      const d = daysSince(r.reportsUpdatedAt, ctx.now);
      return d === null ? null : Math.floor(d);
    } },

  /* ─── quick views (shown as buttons, not in the panel) ────── */
  { key: "attention", label: "Needs attention", group: "presets", kind: "boolean", appliesTo: "all", nullPolicy: "exclude",
    help: "Done, and the score is below its type's median, or the weakest area is below the threshold, or the response rate is low.",
    get: (r, ctx) => {
      if (!COMPLETED.has(r.status)) return false;
      const s = ctx.settings;
      const typeVals = ctx.relative.relscore?.byType.get(r.typeKey);
      const belowMedian = r.orgScore10 !== null && typeVals ? r.orgScore10 < median(typeVals) : false;
      const weakZone = r.weakestZoneScore10 !== null && r.weakestZoneScore10 < s.attentionZone10;
      const lowResponse = r.responseRate !== null && r.responseRate < s.attentionResponseRate;
      return belowMedian || weakZone || lowResponse;
    } },
  { key: "best", label: "Best", group: "presets", kind: "boolean", appliesTo: "all", nullPolicy: "exclude",
    help: "Top 25% by score or NPS among completed projects with enough responses.",
    get: (r, ctx) => {
      if (!COMPLETED.has(r.status) || !enoughSample(r, ctx.settings)) return false;
      const inTop = (key: "relscore" | "relnps", v: number | null) => {
        const all = ctx.relative[key]?.all ?? [];
        return v !== null && all.length >= ctx.settings.relativeMinProjects && v >= quantile(all, 0.75);
      };
      return inTop("relscore", r.orgScore10) || inTop("relnps", r.nps);
    } },
  { key: "nofb", label: "No feedback", group: "presets", kind: "boolean", appliesTo: "all", nullPolicy: "exclude",
    help: "Held over a week ago, has a registration report but no feedback report.",
    get: (r, ctx) => {
      const held = daysSince(r.endDate ?? r.startDate, ctx.now);
      return COMPLETED.has(r.status) && held !== null && held > ctx.settings.noFeedbackDays && r.hasRegistrationReport && !r.hasFeedbackReport;
    } },
];

export const FILTER_BY_KEY = new Map(FILTERS.map((f) => [f.key, f]));

export const GROUP_LABEL: Record<FilterGroup, string> = {
  main: "Main",
  context: "Project context",
  scale: "Scale",
  results: "Results (feedback)",
  acquisition: "Acquisition & audience",
  relative: "Relative to others",
  admin: "Admin",
  presets: "Quick views",
};

/** Quick views: one click = a ready query string. */
export const PRESETS: { key: string; label: string; query: string }[] = [
  { key: "all", label: "All", query: "" },
  { key: "attention", label: "Needs attention", query: "attention=1" },
  { key: "best", label: "Best", query: "best=1" },
  { key: "nofb", label: "No feedback", query: "nofb=1" },
  { key: "onechannel", label: "Depend on one channel", query: "conc=high" },
];

export const SORTS: { key: string; label: string; field?: keyof ProjectRow; score?: boolean }[] = [
  { key: "date", label: "Event date", field: "startDate" },
  { key: "score", label: "Score", field: "orgScore10", score: true },
  { key: "nps", label: "NPS", field: "nps", score: true },
  { key: "regs", label: "Registrations", field: "registrants" },
  { key: "rr", label: "Response rate", field: "responseRate" },
  { key: "name", label: "Name", field: "name" },
];

export function median(sorted: number[]): number {
  return quantile(sorted, 0.5);
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Can this viewer see / use this filter? */
export const filterVisibleTo = (f: FilterDef, admin: boolean) => (f.visibility ?? "public") === "public" || admin;

export const appliesToTypes = (f: FilterDef, types: string[]) =>
  f.appliesTo === "all" || types.length === 0 || types.some((t) => (f.appliesTo as string[]).includes(t));
