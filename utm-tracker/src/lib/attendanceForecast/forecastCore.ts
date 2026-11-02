/**
 * Attendance forecast (BETA) — pure logic, no DOM, no network, no dependencies.
 *
 * Two jobs:
 *  1. scoreRegistrations(): chance that each registrant shows up on day 1 (logistic regression
 *     trained on Business Cup S26 invitees and their day-1 check-in), plus totals and an invite plan.
 *  2. forecastRegistrations(): how many unique registrations to expect by the deadline, from the
 *     shape of the final week of three past projects.
 *
 * The same functions serve both data sources: rows already stored on the site, or an uploaded
 * registration sheet (parsed with detectColumns() + rowsFromSheet()).
 */
import MODEL from './model.json';

/* ------------------------------------------------------------------ types */

export interface RegistrationRow {
  createdAt: Date;                 // when the form was submitted (local time)
  email?: string | null;           // used to drop repeat registrations (first one is kept)
  participationType?: string | null; // "Already have a team" | "Solo participant" | "Looking for a team to join"
  teamName?: string | null;        // team size is counted from this column
  position?: string | null;        // Captain / Team member (informational)
  yearOfStudy?: string | null;
  university?: string | null;
  major?: string | null;
  zimranInterest?: string | null;  // Yes / No / Still exploring
  previousAiesecProject?: string | null;
  segment?: string | null;         // ICP screening: "P0 — Core", "P1 — …", "P2 — …", "Not match"
  name?: string | null;
  telegram?: string | null;
  phone?: string | null;
}

export type Features = {
  team_status: 'Team' | 'Solo' | 'Looking for team';
  team_size_b: '1' | '2' | '3' | '4+' | 'n/a';
  year: string;
  university: string;
  major_cat: string;
  zimran: '' | 'Yes' | 'No' | 'Exploring';
  prior_aiesec_b: 'Yes' | 'No';
  reg_timing: string;
};

export interface ScoredRow extends RegistrationRow {
  features: Features;
  daysToDeadline: number;          // 0 = deadline day
  probability: number;             // 0..1, chance to show up on day 1 if invited
  level: 'high' | 'medium' | 'low';// ≥60% / 40–60% / <40%
}

export interface Expected { n: number; mean: number; low: number; high: number; rate: number }

export interface RegistrationForecast {
  current: number;
  daysLeft: number;                // -1 or less: registration closed
  pacePerDay: number;              // average of the last 7 complete days
  scenarios: Record<'low' | 'mid' | 'high', { final: number; perDay: { daysLeft: number; added: number }[] }>;
  daily: { daysLeft: number; count: number }[];
}

export interface InvitePlan extends Expected {
  target: number;
  invite: number;
  reached: boolean;
  bySegment: Record<string, number>;
  invited: ScoredRow[];
}

/* ------------------------------------------------------------ normalising */

const BOUND_L = '(?<![\\p{L}\\p{N}_])';
const BOUND_R = '(?![\\p{L}\\p{N}_])';
/** Python's \b is Unicode-aware, JS's is not: translate \b into look-arounds. */
function pyRe(src: string): RegExp {
  const s = src.replace(/\\b/g, (_m, i: number) => (/[\p{L}\p{N}_]/u.test(src[i - 1] || '') ? BOUND_R : BOUND_L));
  return new RegExp(s, 'u');
}
const MAJOR: [string, RegExp][] = (MODEL.majorRules as [string, string[]][]).map(([cat, pats]) => [cat, pyRe(pats.join('|'))]);
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function groupMajor(major: unknown): string {
  const m = str(major).toLowerCase().trim();
  if (['', 'nan', '-', '.', 'no', 'major'].includes(m)) return 'Unknown';
  if (['undeclared', 'foundation', 'nufyp', 'gap', 'школ', 'student', 'bachelor'].some((x) => m.includes(x))) return 'Undeclared / Foundation';
  for (const [cat, re] of MAJOR) if (re.test(m)) return cat;
  return 'Other';
}

export function normYear(y: unknown): string {
  const s = str(y).toLowerCase().trim();
  const num: Record<string, string> = { '1': '1st year', '2': '2nd year', '3': '3rd year', '4': '4th year' };
  if (num[s]) return num[s];
  for (const k of ['1st', '2nd', '3rd', '4th']) if (s.includes(k)) return `${k} year`;
  if (s.includes('master') || s.includes('phd')) return "Master's";
  if (s.includes('graduate')) return 'Graduate';
  if (s.includes('foundation')) return 'Foundation';
  return 'Other';
}

const RE_COLLEGE = /college|колледж|lyceum|лицей|school|школ/u;
const RE_NU = /nazarba|назарбаев/u;
const RE_AITU = pyRe('\\baitu\\b|astana it|astans it');
const RE_MNU = pyRe('narikbayev|\\bmnu\\b|kazguu');
const RE_ENU = pyRe('\\benu\\b|eurasian|gumil|гумил');
const RE_OUT = pyRe('kbtu|kazakh.?british|\\bsdu\\b|suleyman|satbayev|satpayev|almau|almaty|narxoz|kimep|kaznu|' +
  'al-farabi|kokshetau|ualikh|zhubanov|atyrau|aktobe|karaganda|shymkent|dku|kasachische');
export function normUniversity(u: unknown): string {
  const s = str(u).trim().toLowerCase();
  if (RE_COLLEGE.test(s)) return 'Other';
  if (RE_NU.test(s) || s === 'nu') return 'NU';
  if (RE_AITU.test(s)) return 'AITU';
  if (RE_MNU.test(s)) return 'MNU';
  if (RE_ENU.test(s)) return 'ENU';
  if (RE_OUT.test(s)) return 'Outside Astana';
  return 'Other';
}

function teamStatus(t: unknown): Features['team_status'] {
  const s = str(t).toLowerCase();
  if (s.includes('already')) return 'Team';
  if (s.includes('looking')) return 'Looking for team';
  return 'Solo';
}
function zimran(z: unknown): Features['zimran'] {
  const s = str(z).trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('y') || s.startsWith('д')) return 'Yes';
  if (s.startsWith('n') || s.startsWith('н')) return 'No';
  return 'Exploring';
}
function priorAiesec(p: unknown): 'Yes' | 'No' {
  const s = str(p).trim();
  return ['', 'nan', '-', 'Other'].includes(s) || s.toLowerCase().includes('haven') ? 'No' : 'Yes';
}
/** Calendar day number, timezone-free (uses the date's local Y/M/D). */
const dayNum = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
function regTiming(daysToDeadline: number): string {
  const d = Math.max(0, daysToDeadline);
  if (d <= 0) return 'Deadline day';
  if (d <= 3) return '1-3 days before';
  if (d <= 7) return '4-7 days before';
  if (d <= 14) return '8-14 days before';
  return '15+ days before';
}
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/* ---------------------------------------------------------------- scoring */

/** Drops repeat registrations (same email, first kept), builds features, adds probability. */
export function scoreRegistrations(rows: RegistrationRow[], deadline: Date): ScoredRow[] {
  const valid = rows.filter((r) => r.createdAt instanceof Date && !isNaN(+r.createdAt)).sort((a, b) => +a.createdAt - +b.createdAt);
  const seen = new Set<string>();
  const uniq: RegistrationRow[] = [];
  valid.forEach((r, i) => {
    const key = str(r.email).toLowerCase().trim() || `__row${i}`;
    if (seen.has(key)) return;
    seen.add(key);
    uniq.push(r);
  });
  const teamCount = new Map<string, number>();
  for (const r of uniq) {
    const t = str(r.teamName).trim().toLowerCase();
    if (t) teamCount.set(t, (teamCount.get(t) || 0) + 1);
  }
  const dl = dayNum(deadline);
  const coef = MODEL.coef as Record<string, number>;
  return uniq.map((r) => {
    const status = teamStatus(r.participationType);
    const t = str(r.teamName).trim().toLowerCase();
    const size = t ? teamCount.get(t)! : 1;
    const daysToDeadline = dl - dayNum(r.createdAt);
    const features: Features = {
      team_status: status,
      team_size_b: status !== 'Team' ? 'n/a' : size >= 4 ? '4+' : (String(size) as '1' | '2' | '3'),
      year: normYear(r.yearOfStudy),
      university: normUniversity(r.university),
      major_cat: groupMajor(r.major),
      zimran: zimran(r.zimranInterest),
      prior_aiesec_b: priorAiesec(r.previousAiesecProject),
      reg_timing: regTiming(daysToDeadline),
    };
    let z = MODEL.intercept;
    for (const [k, v] of Object.entries(features)) z += coef[`${k}=${v}`] ?? 0;   // unseen value -> 0
    const probability = sigmoid(z);
    const level = probability >= 0.6 ? 'high' : probability >= 0.4 ? 'medium' : 'low';
    return { ...r, features, daysToDeadline, probability, level };
  });
}

/** Expected number who come, with a 90% range. Team members attend together, hence the overdispersion factor. */
export function expectedAttendance(rows: ScoredRow[]): Expected {
  let s = 0, v = 0;
  for (const r of rows) { s += r.probability; v += r.probability * (1 - r.probability); }
  const half = 1.645 * Math.sqrt(v * MODEL.overdispersion);
  return { n: rows.length, mean: s, low: Math.max(0, s - half), high: Math.min(rows.length, s + half), rate: rows.length ? s / rows.length : 0 };
}

const SEG_ORDER = ['P0', 'P1', 'P2', 'Not match'];
export const segmentRank = (s: unknown) => { const i = SEG_ORDER.findIndex((x) => str(s).trim().startsWith(x)); return i < 0 ? 9 : i; };
export const segmentLabel = (s: unknown) => (str(s).trim() ? str(s).trim().split(' —')[0] : 'Без сегмента');

/** Smallest invite list (by segment P0→P1→P2, then by probability) whose expected turnout reaches the target. */
export function planInvites(rows: ScoredRow[], target: number, useSegments = true): InvitePlan {
  const list = [...rows].sort((a, b) => (useSegments ? segmentRank(a.segment) - segmentRank(b.segment) : 0) || b.probability - a.probability);
  let s = 0, n = 0;
  while (n < list.length && s < target) { s += list[n].probability; n++; }
  const invited = list.slice(0, n);
  const bySegment: Record<string, number> = {};
  invited.forEach((r) => { const k = segmentLabel(r.segment); bySegment[k] = (bySegment[k] || 0) + 1; });
  return { target, invite: n, reached: s >= target, bySegment, invited, ...expectedAttendance(invited) };
}

/* ------------------------------------------------- registrations forecast */

/**
 * ratio = registrations in the final 7 days / registrations in the 7 days before them
 * (Creative One 1.86, Higgsfield 2.67, Business Cup S26 4.06). The final week is spread over its days
 * with the average past shape (deadline day ≈ 32%).
 */
export function forecastRegistrations(rows: ScoredRow[], deadline: Date, asOf: Date): RegistrationForecast {
  const dS = dayNum(deadline) - dayNum(asOf);
  const byD = new Map<number, number>();
  for (const r of rows) byD.set(r.daysToDeadline, (byD.get(r.daysToDeadline) || 0) + 1);
  const count = (a: number, b: number) => { let c = 0; for (let d = a; d <= b; d++) c += byD.get(d) || 0; return c; };
  const current = rows.length;
  const pace = count(dS + 1, dS + 7) / 7;
  const shape = MODEL.registrationCurve.shareOfFinalWeekByDaysLeft as number[];
  const ratios = MODEL.registrationCurve.ratios as Record<'low' | 'mid' | 'high', number>;
  const scenarios = {} as RegistrationForecast['scenarios'];
  for (const k of ['low', 'mid', 'high'] as const) {
    if (dS < 0) { scenarios[k] = { final: current, perDay: [] }; continue; }
    const lastWeek = dS < 7 ? count(7, 13) * ratios[k] : pace * 7 * ratios[k];
    const perDay: { daysLeft: number; added: number }[] = [];
    for (let d = dS; d >= 0; d--) {
      let add = d >= 7 ? pace : lastWeek * shape[d];
      if (d === dS) add = Math.max(0, add - (byD.get(dS) || 0));   // today is partly in already
      perDay.push({ daysLeft: d, added: add });
    }
    scenarios[k] = { final: current + perDay.reduce((a, x) => a + x.added, 0), perDay };
  }
  const days = [...byD.keys()];
  const daily: RegistrationForecast['daily'] = [];
  if (days.length) for (let d = Math.max(...days); d >= Math.max(Math.min(...days), dS); d--) daily.push({ daysLeft: d, count: byD.get(d) || 0 });
  return { current, daysLeft: dS, pacePerDay: pace, scenarios, daily };
}

/* --------------------------------------------------- uploaded sheet input */

export type Field = keyof Omit<RegistrationRow, 'createdAt'> | 'createdAt';

/** Header synonyms, matched case-insensitively: exact match first, then "header contains synonym". Order matters. */
export const COLUMN_ALIASES: [Field, string[]][] = [
  ['createdAt', ['создано', 'timestamp', 'submitted at', 'submitted', 'created', 'дата и время', 'дата заявки', 'date']],
  ['email', ['почта', 'email', 'e-mail', 'электронная почта']],
  ['participationType', ['participation type', 'тип участия', 'type']],
  ['position', ['position in team', 'position', 'роль']],
  ['teamName', ['team name', 'team_name', 'название команды', 'команда']],
  ['yearOfStudy', ['year of study', 'year_of_study', 'курс']],
  ['university', ['university', 'университет', 'вуз', 'place of study']],
  ['major', ['major', 'специальность']],
  ['zimranInterest', ['zimran']],
  ['previousAiesecProject', ['previous aiesec', 'aiesec project', 'aiesec_project', 'проект aiesec']],
  ['segment', ['screening', 'сегмент']],
  ['telegram', ['telegram']],
  ['phone', ['phone', 'телефон']],
  ['name', ['имя', 'full_name', 'full name', 'фио', 'name']],
];
export const REQUIRED_FIELDS: Field[] = ['createdAt', 'participationType', 'university', 'yearOfStudy'];

/** Maps each field to the header that holds it. Column order in the sheet does not matter. */
export function detectColumns(headers: unknown[]): Partial<Record<Field, string>> {
  const norm = headers.map((h) => str(h).toLowerCase().trim());
  const used = new Set<number>();
  const map: Partial<Record<Field, string>> = {};
  for (const [field, syns] of COLUMN_ALIASES) {
    let hit = -1;
    for (const syn of syns) {
      hit = norm.findIndex((h, i) => !used.has(i) && h === syn);
      if (hit < 0) hit = norm.findIndex((h, i) => !used.has(i) && !!h && h.includes(syn));
      if (hit >= 0) break;
    }
    if (hit >= 0) { used.add(hit); map[field] = str(headers[hit]); }
  }
  return map;
}
export const missingRequired = (map: Partial<Record<Field, string>>) => REQUIRED_FIELDS.filter((f) => !map[f]);

/** Accepts Date objects, Excel serial numbers, "YYYY-MM-DD HH:MM", "DD.MM.YYYY HH:MM", "M/D/YYYY H:MM:SS". */
export function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(+v) ? null : v;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const u = new Date(Math.round((v - 25569) * 864e5));
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes());
  }
  const s = str(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(\d{1,2})?:?(\d{2})?/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0)); }
  return null;
}

/** Sheet rows as objects keyed by header (e.g. SheetJS sheet_to_json) -> RegistrationRow[]. */
export function rowsFromSheet(objects: Record<string, unknown>[], map: Partial<Record<Field, string>>): RegistrationRow[] {
  return objects
    .map((o) => {
      const get = (f: Field) => (map[f] ? (o[map[f]!] as string | null) : null);
      return {
        createdAt: parseDate(get('createdAt')) as Date,
        email: get('email'), participationType: get('participationType'), teamName: get('teamName'), position: get('position'),
        yearOfStudy: get('yearOfStudy'), university: get('university'), major: get('major'), zimranInterest: get('zimranInterest'),
        previousAiesecProject: get('previousAiesecProject'), segment: get('segment'), name: get('name'),
        telegram: get('telegram'), phone: get('phone'),
      };
    })
    .filter((r) => r.createdAt instanceof Date);
}

/** Picks the sheet whose headers match the most fields (required ones weigh most). */
export function pickBestSheet(sheets: { name: string; headers: unknown[] }[]): string | null {
  let best: string | null = null, bestScore = -1;
  for (const s of sheets) {
    const m = detectColumns(s.headers);
    const score = Object.keys(m).length + (missingRequired(m).length === 0 ? 20 : 0);
    if (score > bestScore) { bestScore = score; best = s.name; }
  }
  return best;
}

export const MODEL_INFO = { version: MODEL.version, trainedOn: MODEL.trainedOn, beta: true };
