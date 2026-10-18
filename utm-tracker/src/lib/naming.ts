/**
 * One naming rule for projects and campaigns: "<Project name> <term>", where
 * the term is F'YY (fall) or S'YY (spring) — "SheCodes F'26", "ICY S'27".
 * Pure helpers, safe in the browser and on the server.
 */

export type Term = `${"F" | "S"}'${string}`;

export interface ParsedProjectName {
  base: string; // "SheCodes"
  term: Term; // "F'26"
}

// "F'26", "f’26", "F26", "Fall 2026", "fall'26", "spring 26", "S 2026"…
const TERM_AT_END = /\s+(f|s|fall|autumn|spring)\s*['’`]?\s*(\d{2}|20\d{2})\s*$/i;

/** "SheCodes fall 2026" → { base: "SheCodes", term: "F'26" }; null when there is no term at the end. */
export function parseProjectName(name: string): ParsedProjectName | null {
  const s = name.replace(/\s+/g, " ").trim();
  const m = TERM_AT_END.exec(s);
  if (!m) return null;
  const base = s.slice(0, m.index).trim();
  if (base.length < 2) return null;
  const season = /^(f|fall|autumn)$/i.test(m[1]) ? "F" : "S";
  return { base, term: `${season}'${m[2].slice(-2)}` as Term };
}

export const formatProjectName = (base: string, term: Term | string) => `${base.replace(/\s+/g, " ").trim()} ${term}`;

/** The canonical spelling ("SheCodes F'26"), or null when the name has no term. */
export function normalizeProjectName(name: string): string | null {
  const p = parseProjectName(name);
  return p ? formatProjectName(p.base, p.term) : null;
}

export const NAME_RULE = "Name it \"<Project> F'26\" or \"<Project> S'26\": the project name, then the term (F = fall, S = spring).";

/** Spring is January–June, fall is July–December. */
export function termOf(date: Date | string): Term {
  const d = new Date(date);
  return `${d.getUTCMonth() < 6 ? "S" : "F"}'${String(d.getUTCFullYear()).slice(-2)}` as Term;
}

/** A name as it came (e.g. from a report file), with a term added from the event date if it has none. */
export function withTerm(name: string, date?: Date | string | null): string {
  const n = normalizeProjectName(name);
  if (n) return n;
  return date ? formatProjectName(name, termOf(date)) : name.trim();
}

/** Terms to pick from: two years back to a year ahead, newest first. */
export function termOptions(now = new Date()): Term[] {
  const y = now.getUTCFullYear() % 100;
  const out: Term[] = [];
  for (let yy = y + 1; yy >= y - 2; yy--) out.push(`F'${String(yy).padStart(2, "0")}` as Term, `S'${String(yy).padStart(2, "0")}` as Term);
  return out;
}

/** "F'26" → "fall 2026" (the campaign's season field). */
export function seasonOf(term: Term | string): string {
  const [s, yy] = term.split("'");
  return `${s === "F" ? "fall" : "spring"} 20${yy}`;
}

/** utm_campaign value for a name: "SheCodes F'26" → "shecodes_f26", "Business Cup 2.0 F'26" → "business_cup_2_0_f26". */
export function utmCampaignOf(name: string): string {
  const p = parseProjectName(name);
  const slug = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = slug(p ? p.base : name) || "project";
  return (p ? `${base}_${p.term.replace("'", "").toLowerCase()}` : base).slice(0, 80);
}
