import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("form drop-off report (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `fa${Date.now().toString(36)}`;
  const form = `${tag}-form`;
  let ingest: typeof import("@/lib/formAnalytics/ingest");
  let rep: typeof import("@/lib/formAnalytics/report");
  const FIELDS = [
    { k: "name", kind: "text", req: true },
    { k: "email", kind: "text", req: true },
    { k: "status", kind: "select", req: true },
    { k: "course", kind: "select", cond: true },
    { k: "relocation", kind: "select", req: true },
    { k: "confirmRelocation", kind: "check", cond: true },
  ] as const;

  type Step = [string, string?, Record<string, unknown>?];
  /** Sends a session the way the page script does: one batch, events 1 s apart, a while ago. */
  async function session(name: string, steps: Step[], opts: { test?: boolean; minutesAgo?: number; ctx?: Record<string, unknown> } = {}) {
    const sid = `${tag}${name}`.toLowerCase();
    const t0 = Date.now() - (opts.minutesAgo ?? 90) * 60_000;
    const all: Step[] = [["page_view", undefined, { path: "/x" }], ["field_shown", "confirmRelocation"], ...steps];
    const events = all.map(([t, f, m], i) => ({ id: `${sid}.${i + 1}`, t, ts: t0 + i * 1000, o: i * 1000, ...(f ? { f } : {}), ...(m ? { m } : {}) }));
    const batch = ingest.batchSchema.parse({
      v: 1, sid, vid: `${sid}v`, form, project: "proj-f26", test: opts.test ?? false,
      ctx: { utm_source: "telegram", utm_campaign: "proj_f26", device: "mobile", lang: "ru", fields: FIELDS, ...opts.ctx }, events,
    });
    return ingest.ingest(batch, { ipHash: "h", country: "KZ" });
  }
  const blur = (f: string, dur: number, filled = true, valid = true) => ["field_blur", f, { filled, valid, dur }] as Step;
  const focus = (f: string) => ["field_focus", f] as Step;
  const change = (f: string, value: string) => ["field_change", f, { value, filled: true }] as Step;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ingest = await import("@/lib/formAnalytics/ingest");
    rep = await import("@/lib/formAnalytics/report");
    // S1: left before seeing the form
    await session("s1", [["abandon", undefined, { started: false }]]);
    // S2: saw the form, did not start
    await session("s2", [["form_view"], ["abandon", undefined, { started: false }]]);
    // S3: typed a wrong e-mail and left on it
    await session("s3", [["form_view"], ["form_start", "name"], focus("name"), blur("name", 3000), focus("email"), blur("email", 5000, true, false),
      ["field_error", "email", { error: "invalid", on: "blur" }], ["abandon", "email", { started: true }]], { ctx: { device: "desktop", utm_source: "instagram" } });
    // S4: student, left on «course»
    await session("s4", [["form_start", "name"], focus("name"), blur("name", 1000), focus("email"), blur("email", 2000),
      focus("status"), change("status", "student"), ["field_shown", "course"], blur("status", 800), focus("course"), ["abandon", "course", { started: true }]]);
    // S5: not relocating (confirmation hidden), sent
    await session("s5", [["form_start", "name"], focus("name"), blur("name", 1000), focus("email"), blur("email", 2000), focus("status"), change("status", "working"),
      blur("status", 500), focus("relocation"), change("relocation", "no"), ["field_hidden", "confirmRelocation"], blur("relocation", 700),
      ["submit_attempt", undefined, { filled: ["name", "email", "status", "relocation"] }], ["submit_success", undefined, { city: "almaty" }]]);
    // S6: forgot the confirmation once, then sent; came back to e-mail twice
    await session("s6", [["form_start", "name"], focus("name"), blur("name", 1000), focus("email"), blur("email", 1000), focus("email"), blur("email", 1500),
      focus("status"), change("status", "working"), blur("status", 600), focus("relocation"), change("relocation", "yes"), blur("relocation", 600),
      ["submit_attempt", undefined, { filled: ["name", "email", "status", "relocation"] }], ["field_error", "confirmRelocation", { error: "required", on: "submit" }],
      ["submit_blocked", undefined, { missing: ["confirmRelocation"] }], change("confirmRelocation", "yes"),
      ["submit_attempt", undefined, { filled: ["name", "email", "status", "relocation", "confirmRelocation"] }], ["submit_success"]]);
    // S7: a test session — excluded unless asked for
    await session("s7", [["form_start", "name"], focus("name"), ["submit_attempt"], ["submit_success"]], { test: true });
    // S8: still filling in (5 minutes ago, no leave reported): not counted as gone
    await session("s8", [["form_start", "name"], focus("name")], { minutesAgo: 5 });
  });

  afterAll(async () => {
    await db.analyticsForm.deleteMany({ where: { id: form } });
    await db.$disconnect();
  });

  it("builds the funnel", async () => {
    expect(await rep.funnel({ formId: form })).toMatchObject({
      sessions: 7, visitors: 7, viewed: 7, reachedForm: 6, started: 5, attempted: 2, success: 2,
    });
    const f = await rep.funnel({ formId: form, includeTest: true });
    expect(f).toMatchObject({ sessions: 8, success: 3 });
  });

  it("counts every field: reached, filled, left, drop-off, errors, time, revisits", async () => {
    const rows = Object.fromEntries((await rep.fieldTable({ formId: form })).map((r) => [r.k, r]));
    expect(rows.name).toMatchObject({ reached: 5, filled: 4, leftHere: 0, errors: 0, refocus: 0 });
    expect(rows.email).toMatchObject({ reached: 4, filled: 4, leftHere: 1, dropOff: 25, errors: 1, errorRate: 25, avgMs: 2875, medianMs: 2250, refocus: 1 });
    expect(rows.status).toMatchObject({ reached: 3, filled: 3, leftHere: 0 });
    // conditional: only the student had «course» shown
    expect(rows.course).toMatchObject({ conditional: true, shown: 1, reached: 1, leftHere: 1, dropOff: 100 });
    expect(rows.relocation).toMatchObject({ reached: 2, filled: 2 });
    // hidden for S5 («not relocating»): only S6 counts
    expect(rows.confirmRelocation).toMatchObject({ conditional: true, reached: 1, filled: 1, errors: 1, errorRate: 100 });
  });

  it("splits where people left before the form and why sending was blocked", async () => {
    expect(await rep.leaveSummary({ formId: form })).toEqual({ beforeFormSeen: 1, sawFormNotStarted: 1, startedNoField: 0 });
    expect(await rep.blockedReasons({ formId: form })).toEqual([{ k: "confirmRelocation", sessions: 1, times: 1 }]);
  });

  it("filters and slices", async () => {
    expect((await rep.funnel({ formId: form, device: "desktop" })).sessions).toBe(1);
    const src = await rep.slice({ formId: form }, "source");
    expect(src.find((r) => r.key === "telegram")).toMatchObject({ sessions: 6, success: 2 });
    const reloc = await rep.slice({ formId: form }, "relocation");
    expect(reloc.find((r) => r.key === "no")).toMatchObject({ sessions: 1, success: 1, conversion: 100 });
    expect((await rep.funnel({ formId: form, city: "(none)" })).sessions).toBe(7);
  });

  it("stores a resent batch once and keeps the session outcome", async () => {
    const again = await session("s5", [["form_start", "name"]]);
    expect(again.stored).toBe(0);
    const s = await db.analyticsSession.findUniqueOrThrow({ where: { id: `${tag}s5` } });
    expect(s.outcome).toBe("success");
    expect(s.answers).toEqual({ status: "working", relocation: "no" });
  });

  it("never stores what was typed into text fields", async () => {
    await session("pii", [focus("name"), ["field_change", "name", { value: "Aruzhan", filled: true }], ["field_blur", "email", { filled: true, valid: true, dur: 10, value: "a@b.kz", len: 6 }],
      ["field_change", "status", { value: "ivan@mail.kz" }], ["submit_error", undefined, { error: "rejected a@b.kz" }]]);
    const rows = await db.analyticsEvent.findMany({ where: { sessionId: `${tag}pii` } });
    const text = JSON.stringify(rows.map((r) => r.meta));
    expect(text).not.toMatch(/Aruzhan|a@b\.kz|ivan@mail/);
    expect(rows.find((r) => r.type === "field_blur")!.meta).toEqual({ filled: true, valid: true, dur: 10, len: 6 });
  });
});
