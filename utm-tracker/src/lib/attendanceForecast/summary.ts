import {
  MODEL_INFO, expectedAttendance, forecastRegistrations, planInvites, segmentLabel, segmentRank, scoreRegistrations,
  type Expected, type RegistrationRow, type ScoredRow,
} from "./forecastCore";

/**
 * Everything the «Attendance forecast (beta)» page shows, built from registrations with the
 * functions of forecastCore.ts. Pure and serialisable: the API builds it from the site's leads,
 * the browser from an uploaded sheet, so both sources show the same thing.
 * Dates are wall-clock (local Y/M/D h:m), as forecastCore expects.
 */

/** Below this the forecast is shaky: the page says so. */
export const FEW_REGISTRATIONS = 50;
export const DEFAULT_TARGET = 300;

export interface ForecastOptions {
  /** "YYYY-MM-DD": registration closes at the end of this day. */
  deadline: string;
  /** Now, or the last registration for an uploaded sheet. */
  asOf: Date;
  target: number;
  useSegments: boolean;
  /** Include the participant list (admins only). */
  withPeople: boolean;
}

export interface Group { key: string; n: number; mean: number; rate: number }

export interface Person {
  name: string | null;
  email: string | null;
  telegram: string | null;
  phone: string | null;
  team: string | null;
  university: string | null;
  year: string | null;
  segment: string;
  /** "YYYY-MM-DD HH:MM" */
  createdAt: string;
  probability: number;
  level: ScoredRow["level"];
}

export interface ForecastSummary {
  model: typeof MODEL_INFO;
  deadline: string;
  /** Unique registrations (repeat e-mails dropped) and how many repeats were dropped. */
  unique: number;
  repeats: number;
  /** "YYYY-MM-DD HH:MM" of the last registration, null when there are none. */
  lastAt: string | null;
  few: boolean;
  hasSegments: boolean;
  useSegments: boolean;
  registrations: { daysLeft: number; closed: boolean; current: number; pacePerDay: number; low: number; mid: number; high: number };
  /** Everyone registered so far, if all of them were invited. */
  attendance: Expected;
  /** The same turnout rate applied to the registrations expected by the deadline. */
  atDeadline: number | null;
  plan: { target: number; invite: number; reached: boolean; mean: number; low: number; high: number; bySegment: { key: string; n: number }[] };
  /** One bar per day, oldest first; forecast fields only for the days still ahead. */
  chart: { day: string; daysLeft: number; actual: number; mid?: number; low?: number; high?: number }[];
  groups: { by: "segment" | "status"; rows: Group[]; total: Group; topTwo: Group | null };
  people?: Person[];
}

const text = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d: Date) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "YYYY-MM-DD" → that day at 23:59 (wall clock), null when it is not a date. */
export function deadlineDate(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 23, 59);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

const group = (key: string, rows: ScoredRow[]): Group => {
  const e = expectedAttendance(rows);
  return { key, n: e.n, mean: e.mean, rate: e.rate };
};

/** Team status as the segment table shows it when the sheet has no ICP segments. */
const STATUS_KEY: Record<ScoredRow["features"]["team_status"], string> = { Team: "In a team", Solo: "Solo", "Looking for team": "Looking for a team" };

export function buildForecast(rows: RegistrationRow[], o: ForecastOptions): ForecastSummary | null {
  const deadline = deadlineDate(o.deadline);
  if (!deadline) return null;
  const valid = rows.filter((r) => r.createdAt instanceof Date && !isNaN(+r.createdAt));
  const scored = scoreRegistrations(valid, deadline);
  const fc = forecastRegistrations(scored, deadline, o.asOf);
  const attendance = expectedAttendance(scored);
  const hasSegments = scored.some((r) => String(r.segment ?? "").trim() !== "");
  const useSegments = hasSegments && o.useSegments;
  const target = Math.max(1, Math.round(o.target) || DEFAULT_TARGET);
  const plan = planInvites(scored, target, useSegments);
  const closed = fc.daysLeft < 0;

  // chart: the actual days, then the forecast days up to the deadline
  const dayOf = (daysLeft: number) => { const d = new Date(deadline); d.setDate(d.getDate() - daysLeft); return ymd(d); };
  const bars = new Map<number, ForecastSummary["chart"][number]>();
  for (const d of fc.daily) bars.set(d.daysLeft, { day: dayOf(d.daysLeft), daysLeft: d.daysLeft, actual: d.count });
  if (!closed) {
    fc.scenarios.mid.perDay.forEach((p, i) => {
      const bar = bars.get(p.daysLeft) ?? { day: dayOf(p.daysLeft), daysLeft: p.daysLeft, actual: 0 };
      bars.set(p.daysLeft, { ...bar, mid: p.added, low: fc.scenarios.low.perDay[i].added, high: fc.scenarios.high.perDay[i].added });
    });
  }
  const chart = [...bars.values()].sort((a, b) => b.daysLeft - a.daysLeft);

  // segment table (or team status when there are no segments)
  const keyOf = hasSegments ? (r: ScoredRow) => segmentLabel(r.segment) : (r: ScoredRow) => STATUS_KEY[r.features.team_status];
  const byKey = new Map<string, ScoredRow[]>();
  for (const r of scored) { const k = keyOf(r); byKey.set(k, [...(byKey.get(k) ?? []), r]); }
  const groupRows = [...byKey].map(([k, rs]) => group(k, rs)).sort((a, b) => segmentRank(a.key) - segmentRank(b.key) || a.key.localeCompare(b.key));
  const top = hasSegments ? scored.filter((r) => segmentRank(r.segment) <= 1) : [];

  const last = scored.length ? scored[scored.length - 1].createdAt : null;
  const bySegment = Object.entries(plan.bySegment)
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => segmentRank(a.key) - segmentRank(b.key));

  return {
    model: MODEL_INFO,
    deadline: o.deadline,
    unique: scored.length,
    repeats: valid.length - scored.length,
    lastAt: last ? stamp(last) : null,
    few: scored.length < FEW_REGISTRATIONS,
    hasSegments,
    useSegments,
    registrations: {
      daysLeft: fc.daysLeft, closed, current: fc.current, pacePerDay: fc.pacePerDay,
      low: fc.scenarios.low.final, mid: fc.scenarios.mid.final, high: fc.scenarios.high.final,
    },
    attendance,
    atDeadline: !closed && attendance.n ? fc.scenarios.mid.final * attendance.rate : null,
    plan: { target, invite: plan.invite, reached: plan.reached, mean: plan.mean, low: plan.low, high: plan.high, bySegment },
    chart,
    groups: { by: hasSegments ? "segment" : "status", rows: groupRows, total: group("All", scored), topTwo: top.length ? group("P0 + P1", top) : null },
    people: o.withPeople
      ? scored
          .map((r) => ({
            name: text(r.name), email: text(r.email), telegram: text(r.telegram), phone: text(r.phone),
            team: text(r.teamName), university: text(r.university), year: text(r.yearOfStudy),
            segment: segmentLabel(r.segment), createdAt: stamp(r.createdAt), probability: r.probability, level: r.level,
          }))
          .sort((a, b) => segmentRank(a.segment) - segmentRank(b.segment) || b.probability - a.probability)
      : undefined,
  };
}
