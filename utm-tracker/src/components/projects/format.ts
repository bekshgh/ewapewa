import type { FilterDef, Unit } from "@/lib/projects/filters/registry";
import type { DateRange, FilterValue, Range } from "@/lib/projects/filters/state";
import { seasonLabel } from "@/lib/projects/rows";
import { translate, type Lang } from "@/lib/i18n";

const UNIT_SUFFIX: Record<Unit, string> = { "%": "%", "/10": "/10", days: " days", people: "", years: " yrs" };

export const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  registration: "Registration open",
  done: "Done",
  archived: "Archived",
};

export function fmtNumber(v: number, decimals = 0): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** A stored metric value as shown to people ("4.98%" for 0.0498 with unit %). */
const suffix = (u: Unit, lang: Lang) => (u === "days" || u === "years" ? ` ${translate(lang, UNIT_SUFFIX[u].trim())}` : UNIT_SUFFIX[u]);

export function fmtMetric(v: unknown, f: Pick<FilterDef, "unit" | "scale" | "decimals">, lang: Lang = "en"): string {
  if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) return translate(lang, "no data");
  if (typeof v !== "number") return String(v);
  const x = v * (f.scale ?? 1);
  return `${fmtNumber(x, f.decimals ?? (f.unit === "/10" ? 1 : 0))}${f.unit ? suffix(f.unit, lang) : ""}`;
}

export const unitText = (u?: Unit, lang: Lang = "en") => (u ? suffix(u, lang).trim() : "");

/** "Autumn 2026" in the interface language. */
export const seasonText = (label: string, lang: Lang = "en") => label.replace(/^\S+/, (w) => translate(lang, w));

const DATE_PRESET: Record<string, string> = { season: "This season", "12m": "Last 12 months", lastyear: "Last year" };

export function fmtDate(iso: string | null, lang: Lang = "en"): string {
  if (!iso) return translate(lang, "no date");
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Text of an active-filter chip: "Project type: Forum, Hackathon", "Organization score ≥ 9.0/10". */
export function chipText(f: FilterDef, v: FilterValue, optionLabel: (value: string) => string, lang: Lang = "en"): string {
  const label = translate(lang, f.label);
  if (Array.isArray(v)) return `${label}: ${v.map((x) => (f.key === "season" ? seasonText(seasonLabel(x), lang) : translate(lang, optionLabel(x)))).join(", ")}`;
  if (v === true) return label;
  if (typeof v === "string") return `«${v}»`;
  if (f.kind === "dateRange") {
    const d = v as DateRange;
    if (d.preset) return translate(lang, DATE_PRESET[d.preset]);
    return `${label}: ${d.from ? fmtDate(d.from, lang) : "…"} – ${d.to ? fmtDate(d.to, lang) : "…"}`;
  }
  const r = v as Range;
  const u = f.unit ? suffix(f.unit, lang) : "";
  if (r.min !== undefined && r.max !== undefined) return `${label} ${fmtNumber(r.min, f.decimals ?? 0)}–${fmtNumber(r.max, f.decimals ?? 0)}${u}`;
  if (r.min !== undefined) return `${label} ≥ ${fmtNumber(r.min, f.decimals ?? 0)}${u}`;
  return `${label} ≤ ${fmtNumber(r.max!, f.decimals ?? 0)}${u}`;
}

export { DATE_PRESET };
