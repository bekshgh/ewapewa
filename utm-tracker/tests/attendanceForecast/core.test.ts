/**
 * Reference check from attendance-forecast/forecastCore.test.ts: anonymised Business Cup 2.0
 * registrations (export of 3 Nov 2026, 01:01; names, emails, phones removed). The numbers were
 * computed independently in Python with the same model.
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixture.bc2-2026-11-03.json";
import {
  detectColumns, expectedAttendance, forecastRegistrations, missingRequired, parseDate, planInvites, scoreRegistrations,
} from "@/lib/attendanceForecast/forecastCore";

const parseLocal = (s: string) => {
  const [d, t] = s.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return new Date(y, m - 1, dd, h, mi);
};
const rows = (fixture as { createdAt: string }[]).map((r) => ({ ...r, createdAt: parseLocal(r.createdAt) }));
const deadline = new Date(2026, 10, 9, 23, 59);
const scored = scoreRegistrations(rows, deadline);

describe("attendance forecast core (Business Cup 2.0 reference)", () => {
  it("drops repeat emails and expects 440.7 (412–469) to come", () => {
    expect(scored.length).toBe(845);
    const all = expectedAttendance(scored);
    expect(Math.abs(all.mean - 440.72)).toBeLessThan(0.05);
    expect(Math.abs(all.low - 412)).toBeLessThan(1);
    expect(Math.abs(all.high - 469.4)).toBeLessThan(1);
  });

  it("forecasts 1 556 / 1 868 / 2 404 registrations by the deadline", () => {
    const fc = forecastRegistrations(scored, deadline, new Date(2026, 10, 3, 1, 1));
    expect(fc.daysLeft).toBe(6);
    expect(Math.round(fc.scenarios.low.final)).toBe(1556);
    expect(Math.round(fc.scenarios.mid.final)).toBe(1868);
    expect(Math.round(fc.scenarios.high.final)).toBe(2404);
  });

  it("invites 496 (P0 318 + P1 178) to get 300 people", () => {
    const plan = planInvites(scored, 300, true);
    expect(plan.invite).toBe(496);
    expect(plan.bySegment).toEqual({ P0: 318, P1: 178 });
    const bySeg = (p: string) => expectedAttendance(scored.filter((r) => String(r.segment ?? "").startsWith(p)));
    expect(Math.abs(bySeg("P0").mean - 183.46)).toBeLessThan(0.05);
    expect(Math.abs(bySeg("P1").mean - 151.75)).toBeLessThan(0.05);
  });

  it("finds the columns of both past form layouts and the template, in any order", () => {
    const bc2 = detectColumns(["создано", "статус", "имя", "почта", "метки", "phone number", "telegram", "linkedin / cv", "university", "year of study", "major", "interested in a career at Zimran", "сareer interest", "previous AIESEC project", "participation type", "position in team", "team name", "screening"]);
    expect(missingRequired(bc2)).toEqual([]);
    expect(bc2.segment).toBe("screening");
    const s26 = detectColumns(["Timestamp", "type", "team_name", "position", "year_of_study", "interested_in_zimran", "aiesec_project", "full_name", "email", "phone", "telegram", "linkedin", "university", "major"]);
    expect(missingRequired(s26)).toEqual([]);
    expect(s26.name).toBe("full_name");
    const tpl = detectColumns(["Создано", "Почта", "Participation type", "Position in team", "Team name", "University", "Year of study", "Major", "Interested in a career at Zimran", "Previous AIESEC project", "Screening", "Имя", "Telegram"]);
    expect(missingRequired(tpl)).toEqual([]);
    expect(Object.keys(tpl)).toHaveLength(13);
    expect(detectColumns(["University", "Создано", "Year of study", "Participation type"])).toEqual({
      createdAt: "Создано", participationType: "Participation type", university: "University", yearOfStudy: "Year of study",
    });
  });

  it("reads the date formats sheets use", () => {
    expect(+parseDate("2026-10-19 19:19")!).toBe(+new Date(2026, 9, 19, 19, 19));
    expect(+parseDate("19.10.2026 19:19")!).toBe(+new Date(2026, 9, 19, 19, 19));
    expect(+parseDate("1/23/2026 10:50:12")!).toBe(+new Date(2026, 0, 23, 10, 50));
  });
});
