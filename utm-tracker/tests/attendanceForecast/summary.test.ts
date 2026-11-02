import { describe, expect, it, vi } from "vitest";
import fixture from "./fixture.bc2-2026-11-03.json";
import { buildForecast, deadlineDate } from "@/lib/attendanceForecast/summary";
import type { RegistrationRow } from "@/lib/attendanceForecast/forecastCore";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const parseLocal = (s: string) => {
  const [d, t] = s.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return new Date(y, m - 1, dd, h, mi);
};
const rows: RegistrationRow[] = (fixture as { createdAt: string }[]).map((r) => ({ ...r, createdAt: parseLocal(r.createdAt) }));
const opts = { deadline: "2026-11-09", asOf: new Date(2026, 10, 3, 1, 1), target: 300, useSegments: true, withPeople: false };

describe("forecast summary", () => {
  it("gives the reference numbers for Business Cup 2.0", () => {
    const s = buildForecast(rows, opts)!;
    expect(s.unique).toBe(845);
    expect(s.repeats).toBe(rows.length - 845);
    expect(Math.round(s.registrations.mid)).toBe(1868);
    expect(s.registrations.closed).toBe(false);
    expect(s.attendance.mean).toBeCloseTo(440.72, 1);
    expect(s.plan).toMatchObject({ invite: 496, reached: true, bySegment: [{ key: "P0", n: 318 }, { key: "P1", n: 178 }] });
    expect(s.groups.by).toBe("segment");
    expect(s.groups.rows.map((g) => g.key).slice(0, 2)).toEqual(["P0", "P1"]);
    expect(s.groups.topTwo!.n).toBe(s.groups.rows[0].n + s.groups.rows[1].n);
    expect(s.few).toBe(false);
    expect(s.people).toBeUndefined();
    expect(s.model).toMatchObject({ version: "bc-s26-day1-v1", beta: true });
  });

  it("draws the actual days and the forecast days up to the deadline", () => {
    const s = buildForecast(rows, opts)!;
    const last = s.chart[s.chart.length - 1];
    expect(last).toMatchObject({ day: "2026-11-09", daysLeft: 0, actual: 0 });
    expect(last.mid).toBeGreaterThan(0);
    expect(last.low!).toBeLessThan(last.high!);
    const today = s.chart.find((b) => b.daysLeft === 6)!;
    expect(today.day).toBe("2026-11-03");
    expect(s.chart[0].mid).toBeUndefined(); // past days are actual only
  });

  it("after the deadline the forecast is the actual count", () => {
    const s = buildForecast(rows, { ...opts, deadline: "2026-10-25", asOf: new Date(2026, 10, 3) })!;
    expect(s.registrations.closed).toBe(true);
    expect(s.registrations.mid).toBe(s.registrations.current);
    expect(s.atDeadline).toBeNull();
    expect(s.chart.every((b) => b.mid === undefined)).toBe(true);
  });

  it("without segments plans by chance and groups by participation type", () => {
    const plain = rows.map(({ segment: _s, ...r }) => r);
    const s = buildForecast(plain, { ...opts, withPeople: true })!;
    expect(s.hasSegments).toBe(false);
    expect(s.useSegments).toBe(false);
    expect(s.groups.by).toBe("status");
    expect(s.groups.rows.map((g) => g.key).sort()).toEqual(["In a team", "Looking for a team", "Solo"]);
    expect(s.groups.topTwo).toBeNull();
    expect(s.people).toHaveLength(845);
    expect(s.people![0].probability).toBeGreaterThanOrEqual(s.people![1].probability);
  });

  it("warns about too few registrations and needs a real deadline", () => {
    expect(buildForecast(rows.slice(0, 20), opts)!.few).toBe(true);
    expect(buildForecast(rows, { ...opts, deadline: "" })).toBeNull();
    expect(deadlineDate("2026-02-30")).toBeNull();
    expect(+deadlineDate("2026-11-09")!).toBe(+new Date(2026, 10, 9, 23, 59));
  });
});

describe("answers from a lead's payload", () => {
  it("reads the form fields of a Tilda webhook body and skips Tilda's own keys", async () => {
    const { answersOf } = await import("@/lib/attendanceForecast/site");
    expect(answersOf({
      Name: "Aru", Email: "a@x.kz", formid: "form123", tranid: "1:2", utm_source: "telegram", COOKIES: "x",
      participation_type: "Solo participant", University: "AITU", year_of_study: "1st year Undergraduate", Major: "CS", Screening: "P1 — Strong Adjacent",
    })).toEqual({ participationType: "Solo participant", university: "AITU", yearOfStudy: "1st year Undergraduate", major: "CS", segment: "P1 — Strong Adjacent" });
  });

  it("takes the answers an imported sheet stored, and nothing from other payloads", async () => {
    const { answersOf } = await import("@/lib/attendanceForecast/site");
    expect(answersOf({ _source: "registration-import", answers: { university: "NU", teamName: "Rum", junk: "x" } })).toEqual({ university: "NU", teamName: "Rum" });
    expect(answersOf({ _source: "form_submit_migration", click_id: "c1" })).toEqual({});
    expect(answersOf(null)).toEqual({});
  });
});
