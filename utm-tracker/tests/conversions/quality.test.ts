import { describe, expect, it } from "vitest";
import {
  countPeople,
  dnsMxLookup,
  maskEmail,
  normalizeEmail,
  normalizePhone,
  processRows,
  resetMxCache,
  statusOf,
  type SourceRow,
} from "@/lib/conversions/quality";
import { DEFAULT_QUALITY } from "@/lib/conversions/settings";

const noMx = { ...DEFAULT_QUALITY, checkMx: false };
const t0 = new Date("2026-10-01T10:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);
let n = 0;
const row = (r: Partial<SourceRow>): SourceRow => ({ ref: `r${++n}`, at: at(n * 10), ...r });
const flagsOf = async (r: Partial<SourceRow>, settings = noMx) => (await processRows([row(r)], { settings })).people[0]?.flags ?? [];

describe("normalisation", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ainur.K@Mail.RU ")).toBe("ainur.k@mail.ru");
  });
  it("drops gmail dots and +tag (setting on by default)", () => {
    expect(normalizeEmail("A.i.n.u.r+forum@Gmail.com")).toBe("ainur@gmail.com");
    expect(normalizeEmail("ainur@googlemail.com")).toBe("ainur@gmail.com");
    expect(normalizeEmail("a.i+x@gmail.com", false)).toBe("a.i+x@gmail.com");
    expect(normalizeEmail("a.b+x@mail.ru")).toBe("a.b+x@mail.ru"); // only gmail
  });
  it("empty and malformed emails are not counted", () => {
    for (const e of ["", "   ", null, "nope", "a@b", "a b@c.com", "@gmail.com"]) expect(normalizeEmail(e)).toBeNull();
  });
  it("phones and masks", () => {
    expect(normalizePhone("8 (701) 123-45-67")).toBe("77011234567");
    expect(normalizePhone("+7 701 123 45 67")).toBe("77011234567");
    expect(maskEmail("ainur@gmail.com")).toBe("a***@gmail.com");
  });
});

describe("duplicates", () => {
  it("one record per person, earliest wins, with a matching breakdown", async () => {
    const rows: SourceRow[] = [
      { ref: "late", email: "AINUR@gmail.com ", at: at(30) },
      { ref: "early", email: "a.inur+reg@gmail.com", at: at(1) },
      { ref: "dup2", email: "ainur@googlemail.com", at: at(50) },
      { ref: "other", email: "bota@mail.ru", at: at(5) },
      { ref: "empty", email: "", at: at(6) },
      { ref: "bad", email: "not-an-email", at: at(7) },
    ];
    const p = await processRows(rows, { settings: noMx });
    expect(p).toMatchObject({ raw: 6, invalid: 2, duplicates: 2 });
    expect(p.people.map((x) => x.ref).sort()).toEqual(["early", "other"]);
    const b = countPeople(p.people.map((x) => ({ key: x.key, status: statusOf(x.riskScore), decision: null })), p, true);
    expect(b).toMatchObject({ raw: 6, invalid: 2, duplicates: 2, unique: 2, total: 2 });
  });

  it("same phone with different emails is flagged, not merged", async () => {
    const p = await processRows(
      [row({ email: "one@mail.ru", phone: "8 701 555 12 34" }), row({ email: "two@mail.ru", phone: "+77015551234" })],
      { settings: noMx },
    );
    expect(p.people).toHaveLength(2);
    for (const x of p.people) expect(x.flags).toContain("possible_duplicate");
  });
});

describe("flags (one test each)", () => {
  it("invalid_email_format", async () => {
    expect(await flagsOf({ email: "ainur@gmial.com" })).toContain("invalid_email_format");
    expect(await flagsOf({ email: "ainur..k@mail.ru" })).toContain("invalid_email_format");
    expect(await flagsOf({ email: "ainur@mail.ru" })).not.toContain("invalid_email_format");
  });
  it("disposable_email", async () => {
    expect(await flagsOf({ email: "x1@mailinator.com" })).toContain("disposable_email");
  });
  it("no_mx (lookup injected; a DNS failure never flags)", async () => {
    const settings = { ...DEFAULT_QUALITY, checkMx: true };
    const mx = async (d: string) => (d === "nomx.kz" ? false : d === "flaky.kz" ? null : true);
    const p = await processRows([row({ email: "a@nomx.kz" }), row({ email: "b@flaky.kz" }), row({ email: "c@ok.kz" })], { settings, mx });
    expect(p.people.map((x) => x.flags.includes("no_mx"))).toEqual([true, false, false]);
    const broken = async () => { throw new Error("dns down"); };
    const q = await processRows([row({ email: "a@nomx.kz" })], { settings, mx: broken });
    expect(q.people[0].flags).not.toContain("no_mx");
  });
  it("no_mx with real DNS semantics: a broken resolver (everything 'not found') flags nobody", async () => {
    const settings = { ...DEFAULT_QUALITY, checkMx: true };
    const notFound = Object.assign(new Error("nf"), { code: "ENOTFOUND" });
    resetMxCache();
    const broken = dnsMxLookup(100, async () => { throw notFound; });
    const p = await processRows([row({ email: "a@mail.ru" }), row({ email: "b@nomx.kz" })], { settings, mx: broken });
    expect(p.people.some((x) => x.flags.includes("no_mx"))).toBe(false);
    resetMxCache();
    const healthy = dnsMxLookup(100, async (d) => { if (d === "nomx.kz") throw notFound; return [{ exchange: "mx" }]; });
    const q = await processRows([row({ email: "a@mail.ru" }), row({ email: "b@nomx.kz" })], { settings, mx: healthy });
    expect(q.people.map((x) => x.flags.includes("no_mx"))).toEqual([false, true]);
    resetMxCache();
  });
  it("test_words", async () => {
    expect(await flagsOf({ email: "test123@mail.ru" })).toContain("test_words");
    expect(await flagsOf({ email: "a@mail.ru", name: "Тест Тестов" })).toContain("test_words");
    expect(await flagsOf({ email: "b@mail.ru", name: "aaaaa" })).toContain("test_words");
    expect(await flagsOf({ email: "ainur@mail.ru", name: "Айнур Касымова" })).not.toContain("test_words");
  });
  it("gibberish_name_or_email", async () => {
    expect(await flagsOf({ email: "xkcdqwvbn@mail.ru" })).toContain("gibberish_name_or_email");
    expect(await flagsOf({ email: "c@mail.ru", name: "Ксфвб" })).toContain("gibberish_name_or_email");
    expect(await flagsOf({ email: "zhanbyrbayev.d@mail.ru", name: "Dias Zhanbyrbayev" })).not.toContain("gibberish_name_or_email");
  });
  it("placeholder_phone", async () => {
    for (const phone of ["+7 777 777 77 77", "1234567", "8 701 000 00 00"]) expect(await flagsOf({ email: `p${phone.length}${n}@mail.ru`, phone })).toContain("placeholder_phone");
    expect(await flagsOf({ email: "real@mail.ru", phone: "+7 701 348 92 15" })).not.toContain("placeholder_phone");
  });
  it("burst (same minute, same IP; without IP, same domain)", async () => {
    const same = Array.from({ length: 5 }, (_, i) => ({ ref: `b${i}`, email: `user${i}@corp.kz`, at: at(0), ipHash: "ip1" }));
    const p = await processRows(same, { settings: noMx });
    expect(p.people.every((x) => x.flags.includes("burst"))).toBe(true);
    const spread = same.map((r, i) => ({ ...r, at: at(i * 5) }));
    expect((await processRows(spread, { settings: noMx })).people.some((x) => x.flags.includes("burst"))).toBe(false);
    const noIp = same.map(({ ipHash: _, ...r }) => r);
    expect((await processRows(noIp, { settings: noMx })).people.every((x) => x.flags.includes("burst"))).toBe(true);
  });
  it("missing_utm only where the source has a UTM column", async () => {
    expect(await flagsOf({ email: "u1@mail.ru", utm: "" })).toContain("missing_utm");
    expect(await flagsOf({ email: "u2@mail.ru", utm: "icy_s26" })).not.toContain("missing_utm");
    expect(await flagsOf({ email: "u3@mail.ru" })).not.toContain("missing_utm");
  });
});

describe("scores, statuses and counting", () => {
  it("weights add up and thresholds pick the status", async () => {
    expect(statusOf(0)).toBe("valid");
    expect(statusOf(29)).toBe("valid");
    expect(statusOf(30)).toBe("suspicious");
    expect(statusOf(69)).toBe("suspicious");
    expect(statusOf(70)).toBe("quarantined");
    const [p] = (await processRows([row({ email: "test@mailinator.com" })], { settings: noMx })).people;
    expect(p.riskScore).toBe(Math.min(100, DEFAULT_QUALITY.weights.disposable_email + DEFAULT_QUALITY.weights.test_words));
    expect(statusOf(p.riskScore)).toBe("quarantined");
  });

  const base = { raw: 10, invalid: 1, duplicates: 2 };
  const people = [
    { key: "a", status: "valid" as const, decision: null },
    { key: "b", status: "valid" as const, decision: null },
    { key: "c", status: "suspicious" as const, decision: null },
    { key: "d", status: "suspicious" as const, decision: null },
    { key: "e", status: "quarantined" as const, decision: null },
    { key: "f", status: "quarantined" as const, decision: null },
    { key: "g", status: "valid" as const, decision: null },
  ];

  it("counts valid + suspicious by default, never quarantined; strict = valid + approved", () => {
    expect(countPeople(people, base, true)).toMatchObject({ unique: 7, total: 5, strict: 3, pending: 2, quarantined: 2 });
  });
  it("countSuspicious off excludes suspicious", () => {
    expect(countPeople(people, base, false)).toMatchObject({ total: 3, strict: 3, suspiciousExcluded: 2 });
  });
  it("decisions change the total and are reversible", () => {
    const decided = people.map((p) => (p.key === "e" ? { ...p, decision: "approved" as const } : p.key === "a" ? { ...p, decision: "rejected" as const } : p));
    expect(countPeople(decided, base, true)).toMatchObject({ total: 5, strict: 3, approved: 1, rejected: 1, quarantined: 1 });
    // undo = decision back to null → original numbers
    expect(countPeople(decided.map((p) => ({ ...p, decision: null })), base, true)).toEqual(countPeople(people, base, true));
  });
});
