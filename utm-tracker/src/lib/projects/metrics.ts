import type { CellValue, KpiSection, ReportDocument, TableSection } from "@/lib/reports/types";
import { CONCENTRATION, channelGroupOf, stageOf, zoneOf } from "./dictionaries";

/**
 * ReportDocument(s) of one project → the flat numbers the project filters use.
 * Pure: no database. Everything is read from the reports; anything missing is
 * null (never 0). Scores are normalised to /10 here, not at display time.
 *
 * Bump METRICS_VERSION whenever a formula changes, then run
 * `npm run projects:recompute` to refresh every project.
 */
export const METRICS_VERSION = 2;

export interface MetricsSettings {
  /** Peak-day share above which a campaign counts as "bursty". */
  burstyPeakShare: number;
}

export const DEFAULT_METRICS_SETTINGS: MetricsSettings = { burstyPeakShare: 0.2 };

/** "kind:raw theme label" → canonical theme key (or null = not mapped). */
export type ThemeLookup = (kind: "praise" | "pain", rawLabel: string) => string | null;

export interface ComputedMetrics {
  registrants: number | null;
  submissions: number | null;
  campaignDays: number | null;
  channelCount: number | null;
  responses: number | null;
  responseRate: number | null;
  orgScore10: number | null;
  nps: number | null;
  composite10: number | null;
  weakestZone: string | null;
  weakestZoneScore10: number | null;
  strongestZone: string | null;
  strongestZoneScore10: number | null;
  topPraiseTheme: string | null;
  topPainTheme: string | null;
  topChannelGroup: string | null;
  topChannelShare: number | null;
  topChannel: string | null;
  topChannelOwnShare: number | null;
  hhiGroups: number | null;
  concentrationLevel: string | null;
  peakDayShare: number | null;
  isBursty: boolean | null;
  topUniversityName: string | null;
  topUniversityShare: number | null;
  newToOrgShare: number | null;
  internshipShare: number | null;
  avgAge: number | null;
  duplicateRate: number | null;
  audienceStage: string | null;
  ageBand: string | null;
}

/* ─── lookups in a ReportDocument ───────────────────────────────── */

const num = (v: CellValue | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Older templates write KPI values as text: "21.3 yrs" → 21.3, "53%" → 0.53. */
function textNum(v: CellValue | undefined): number | null {
  if (typeof v !== "string") return null;
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(%?)/.exec(v);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return m[2] ? n / 100 : n;
}

function kpi(doc: ReportDocument | undefined, label: RegExp): number | null {
  for (const sh of doc?.sheets ?? [])
    for (const s of sh.sections)
      if (s.kind === "kpiGroup") {
        const card = (s as KpiSection).cards.find((c) => label.test(c.label));
        if (card) return num(card.value) ?? textNum(card.value);
      }
  return null;
}

function kpiText(doc: ReportDocument | undefined, label: RegExp): string | null {
  for (const sh of doc?.sheets ?? [])
    for (const s of sh.sections)
      if (s.kind === "kpiGroup") {
        const card = s.cards.find((c) => label.test(c.label));
        if (card) return card.subtext ?? null;
      }
  return null;
}

function table(doc: ReportDocument | undefined, sheet: string, title: RegExp): TableSection | undefined {
  return doc?.sheets.find((s) => s.key === sheet)?.sections.find((s): s is TableSection => s.kind === "table" && title.test(s.title));
}

const col = (t: TableSection, re: RegExp) => t.columns.findIndex((c) => re.test(c.label.trim()));
const dataRows = (t: TableSection) => t.rows.filter((_, i) => i !== t.totalRow);

/** Row with the largest number in column `ci` (ties: first), optionally skipping some labels. */
function maxRow(t: TableSection, ci: number, skip?: RegExp, labelCol = 0) {
  let best: CellValue[] | undefined;
  for (const r of dataRows(t)) {
    if (skip && skip.test(String(r[labelCol] ?? ""))) continue;
    const v = num(r[ci]);
    if (v !== null && (!best || v > (num(best[ci]) ?? -Infinity))) best = r;
  }
  return best;
}

const ratio = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? a / b : null);

/* ─── feedback ──────────────────────────────────────────────────── */

function zoneScores(fb: ReportDocument): Map<string, number> {
  const t = table(fb, "overview", /SCORE SUMMARY/);
  const out = new Map<string, number[]>();
  if (!t) return new Map();
  const s10 = col(t, /Score \/10/i);
  const mean = col(t, /^Mean$/i);
  const scale = col(t, /^Scale$/i);
  for (const r of dataRows(t)) {
    const zone = zoneOf(String(r[0] ?? ""));
    if (!zone) continue;
    let v = s10 >= 0 ? num(r[s10]) : null;
    if (v === null && mean >= 0) {
      const m = num(r[mean]);
      const top = /1\s*[–-]\s*(\d+)/.exec(String(scale >= 0 ? r[scale] : ""))?.[1];
      v = m !== null && top ? (m * 10) / Number(top) : null;
    }
    if (v !== null) out.set(zone, [...(out.get(zone) ?? []), v]);
  }
  return new Map([...out].map(([k, vs]) => [k, vs.reduce((a, b) => a + b, 0) / vs.length]));
}

function topTheme(fb: ReportDocument, title: RegExp, kind: "praise" | "pain", themes: ThemeLookup): string | null {
  const t = table(fb, "themes", title);
  if (!t) return null;
  const view = t.views.find((v) => v.type === "ranked");
  const label = view && "label" in view ? view.label : col(t, /Theme/i);
  if (label < 0) return null;
  // Rows are already ranked by mentions; the first one we can map wins.
  for (const r of dataRows(t)) {
    const key = themes(kind, String(r[label] ?? ""));
    if (key) return key;
  }
  return null;
}

/* ─── main ──────────────────────────────────────────────────────── */

export function computeMetrics(
  input: { registration?: ReportDocument; feedback?: ReportDocument; themes?: ThemeLookup },
  settings: MetricsSettings = DEFAULT_METRICS_SETTINGS,
): ComputedMetrics {
  const reg = input.registration;
  const fb = input.feedback;
  const themes: ThemeLookup = input.themes ?? (() => null);

  // Registration: scale
  const uniqueRegistrants = kpi(reg, /UNIQUE REGISTRANTS/i);
  const submissions = kpi(reg, /FORM SUBMISSIONS/i);
  // Older templates (2025) count only form submissions.
  const registrants = uniqueRegistrants ?? submissions;
  let peakRegs = kpi(reg, /PEAK DAY REGS/i);
  if (peakRegs === null) {
    const days = table(reg, "trend", /DAY-BY-DAY/);
    const c = days ? col(days, /^(Submissions|Regs|Registrations)$/i) : -1;
    const r = days && c >= 0 ? maxRow(days, c) : undefined;
    peakRegs = r ? num(r[c]) : null;
  }
  const peakDayShare = ratio(peakRegs, registrants);

  // Channel groups
  const groups = table(reg, "channels", /GROUP SUMMARY/);
  let topChannelGroup: string | null = null;
  let topChannelShare: number | null = null;
  if (groups) {
    const regsCol = col(groups, /^Regs$/i);
    const shareCol = col(groups, /^Share$/i);
    const r = regsCol >= 0 ? maxRow(groups, regsCol) : undefined;
    if (r) {
      topChannelGroup = channelGroupOf(String(r[0])) ?? null;
      topChannelShare = shareCol >= 0 ? num(r[shareCol]) : ratio(num(r[regsCol]), registrants);
    }
  }

  // Single best channel
  const h2h = table(reg, "overview", /HEAD-TO-HEAD/);
  let topChannel: string | null = null;
  let topChannelOwnShare: number | null = null;
  if (h2h) {
    const regsCol = col(h2h, /^Regs$/i);
    const shareCol = col(h2h, /^Share$/i);
    const r = regsCol >= 0 ? maxRow(h2h, regsCol) : undefined;
    if (r) {
      topChannel = typeof r[0] === "string" ? r[0] : null;
      topChannelOwnShare = shareCol >= 0 ? num(r[shareCol]) : ratio(num(r[regsCol]), registrants);
    }
  }

  // Older templates: one "HOW THEY FOUND …" table instead of channel tables
  if (topChannel === null) {
    const found = table(reg, "overview", /HOW THEY FOUND/);
    const countCol = found ? col(found, /^(Count|Regs)$/i) : -1;
    const shareCol = found ? col(found, /^Share$/i) : -1;
    const r = found && countCol >= 0 ? maxRow(found, countCol, /^(unknown|other|\(not specified\))$/i) : undefined;
    if (r) {
      topChannel = typeof r[0] === "string" ? r[0] : null;
      topChannelOwnShare = shareCol >= 0 ? num(r[shareCol]) : ratio(num(r[countCol]), registrants);
      if (topChannelGroup === null && topChannel) {
        topChannelGroup = channelGroupOf(topChannel) ?? null;
        if (topChannelGroup) topChannelShare = topChannelOwnShare;
      }
    }
  }

  // Concentration of channel groups
  const conc = table(reg, "patterns", /CONCENTRATION/);
  let hhiGroups: number | null = null;
  let concentrationLevel: string | null = null;
  if (conc) {
    const row = dataRows(conc).find((r) => /channel groups?/i.test(String(r[0])));
    const hhi = col(conc, /HHI/);
    const st = col(conc, /Concentration/i);
    if (row) {
      hhiGroups = hhi >= 0 ? num(row[hhi]) : null;
      const status = st >= 0 ? String(row[st] ?? "") : "";
      concentrationLevel = CONCENTRATION.find((c) => c.match.test(status.toLowerCase()))?.key ?? null;
    }
  }

  // Top university (by name from the data; "Other" / "(not specified)" are not universities)
  const uni = table(reg, "audience", /^UNIVERSITY$/);
  let topUniversityName: string | null = null;
  let topUniversityShare: number | null = null;
  if (uni) {
    const view = uni.views.find((v) => v.type === "ranked");
    const label = view && "label" in view ? view.label : 1;
    const regsCol = col(uni, /^Regs$/i);
    const shareCol = col(uni, /^Share$/i);
    const r = regsCol >= 0 ? maxRow(uni, regsCol, /^(other|\(not specified\)|school|college)/i, label) : undefined;
    if (r) {
      topUniversityName = String(r[label]);
      topUniversityShare = shareCol >= 0 ? num(r[shareCol]) : ratio(num(r[regsCol]), registrants);
    }
  }

  // Older templates: "UNIVERSITY BREAKDOWN" on the overview, "#" first, "Count" instead of "Regs"
  if (topUniversityName === null) {
    const old = table(reg, "overview", /UNIVERSITY BREAKDOWN/);
    const label = old ? col(old, /University/i) : -1;
    const countCol = old ? col(old, /^(Count|Regs)$/i) : -1;
    const shareCol = old ? col(old, /^Share$/i) : -1;
    const r = old && label >= 0 && countCol >= 0 ? maxRow(old, countCol, /^(other|\(not specified\)|school|college|non-|foreign)/i, label) : undefined;
    if (r) {
      topUniversityName = String(r[label]);
      topUniversityShare = shareCol >= 0 ? num(r[shareCol]) : ratio(num(r[countCol]), registrants);
    }
  }

  // Duplicates
  const dup = table(reg, "patterns", /DUPLICATE/);
  let duplicateRate: number | null = null;
  if (dup) {
    const row = dataRows(dup).find((r) => /duplicate rate/i.test(String(r[0])));
    duplicateRate = row ? num(row[1]) : null;
  }
  if (duplicateRate === null && submissions !== null && uniqueRegistrants !== null && submissions > 0) {
    duplicateRate = (submissions - uniqueRegistrants) / submissions;
  }

  // Dominant study stage ("All" row of the audience mix)
  const mix = table(reg, "channels", /AUDIENCE MIX/);
  let audienceStage: string | null = null;
  if (mix && mix.totalRow !== undefined) {
    const total = mix.rows[mix.totalRow];
    let best = -1;
    mix.columns.forEach((c, i) => {
      if (i < 2 || c.format.kind !== "percent") return;
      const v = num(total[i]);
      if (v !== null && (best < 0 || v > (num(total[best]) ?? -1))) best = i;
    });
    if (best >= 0) audienceStage = stageOf(mix.columns[best].label);
  }

  // Most common age band
  const ages = table(reg, "audience", /AGE BAND/);
  let ageBand: string | null = null;
  if (ages) {
    const view = ages.views.find((v) => v.type === "ranked");
    const label = view && "label" in view ? view.label : 1;
    const regsCol = col(ages, /^Regs$/i);
    const r = regsCol >= 0 ? maxRow(ages, regsCol, undefined, label) : undefined;
    ageBand = r ? String(r[label]) : null;
  }

  // Feedback
  const responses = kpi(fb, /TOTAL RESPONSES/i) ?? (fb?.meta.sampleSize ?? null);
  let responseRate = ratio(responses, registrants);
  if (responseRate === null && responses !== null) {
    // Without a registration report: "= 5% of 603 registrants" under the responses card.
    const m = /of\s+([\d,]+)\s+registrants/i.exec(kpiText(fb, /TOTAL RESPONSES/i) ?? "");
    responseRate = m ? ratio(responses, Number(m[1].replace(/,/g, ""))) : null;
  }

  const zones = fb ? zoneScores(fb) : new Map<string, number>();
  const sorted = [...zones].sort((a, b) => a[1] - b[1]);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];

  return {
    registrants,
    submissions,
    campaignDays: kpi(reg, /CAMPAIGN DAYS/i),
    channelCount: kpi(reg, /ACTIVE CHANNELS/i),
    responses,
    responseRate,
    orgScore10: kpi(fb, /AVG ORGANI[SZ]ATION/i),
    nps: kpi(fb, /NPS/i),
    composite10: kpi(fb, /COMPOSITE/i),
    weakestZone: weakest?.[0] ?? null,
    weakestZoneScore10: weakest?.[1] ?? null,
    strongestZone: strongest?.[0] ?? null,
    strongestZoneScore10: strongest?.[1] ?? null,
    topPraiseTheme: fb ? topTheme(fb, /LIKED/, "praise", themes) : null,
    topPainTheme: fb ? topTheme(fb, /PAIN/, "pain", themes) : null,
    topChannelGroup,
    topChannelShare,
    topChannel,
    topChannelOwnShare,
    hhiGroups,
    concentrationLevel,
    peakDayShare,
    isBursty: peakDayShare === null ? null : peakDayShare > settings.burstyPeakShare,
    topUniversityName,
    topUniversityShare,
    newToOrgShare: kpi(reg, /NEW TO AIESEC/i),
    internshipShare: kpi(reg, /WANT AN INTERNSHIP|AIESEC INTEREST/i),
    avgAge: kpi(reg, /AVERAGE AGE|AVG AGE/i),
    duplicateRate,
    audienceStage,
    ageBand,
  };
}

/** Theme tables of a feedback report, for building ThemeMapping rows on upload. */
export function themeLabels(fb: ReportDocument): { kind: "praise" | "pain" | "request"; rawLabel: string }[] {
  const out: { kind: "praise" | "pain" | "request"; rawLabel: string }[] = [];
  const kinds: [RegExp, "praise" | "pain" | "request"][] = [[/LIKED/, "praise"], [/PAIN/, "pain"], [/REQUESTS/, "request"]];
  for (const [re, kind] of kinds) {
    const t = table(fb, "themes", re);
    if (!t) continue;
    const view = t.views.find((v) => v.type === "ranked");
    const label = view && "label" in view ? view.label : col(t, /Theme/i);
    if (label < 0) continue;
    for (const r of dataRows(t)) if (typeof r[label] === "string") out.push({ kind, rawLabel: r[label] as string });
  }
  return out;
}
