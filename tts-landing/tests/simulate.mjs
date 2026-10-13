// End-to-end check of the drop-off analytics: drives 27 visits through the real
// built page (dist-local, collector → local tracker), keeps its own expected
// numbers from what each visit did, then reads the tracker's dashboard and
// compares. Also checks that nothing typed into text fields reached the DB.
//
//   TRACKER=http://localhost:3000 DATABASE_URL=… node tests/simulate.mjs
import { chromium, page as assemble, serve, LANDING, LAUNCH } from "./harness.mjs";
import { createRequire } from "node:module";

const TRACKER = process.env.TRACKER ?? "http://localhost:3000";
const FORM = "tts-f26-registration";
const html = assemble("dist-local");
const require = createRequire(import.meta.url);
const { PrismaClient } = require(process.cwd() + "/../utm-tracker/node_modules/@prisma/client");
const db = new PrismaClient();

const ORDER = ["name", "email", "phone", "telegram", "city", "age", "status", "course", "university", "universityName", "english", "relocation", "confirmRelocation", "confirmData"];
const COND = new Set(["course", "confirmRelocation"]);
const SEL = { name: "#f-name", email: "#f-email", phone: "#f-phone", telegram: "#f-tg", city: "#f-city", age: "#f-age", status: "#f-status", course: "#f-course",
  university: "#f-uni", universityName: "#f-uniname", english: "#f-eng", relocation: "#f-reloc", confirmRelocation: "#f-c1", confirmData: "#f-c2" };
const KIND = { city: "select", status: "select", course: "select", university: "select", universityName: "select", english: "select", relocation: "select", confirmRelocation: "check", confirmData: "check" };
const CHECK = { name: () => true, email: (v) => v.indexOf("@") > 0 && v.indexOf(".", v.indexOf("@")) > 0, phone: (v) => v.replace(/\D/g, "").length >= 10,
  telegram: (v) => /^@[A-Za-z0-9_]{4,32}$/.test(v), age: (v) => Number(v) >= 18 && Number(v) <= 70 };
const TYPED = []; // every text value typed — must never appear in the DB

/** One visitor. Mirrors the page's own rules to know what the dashboard should say. */
class Visit {
  constructor(p) { this.p = p; this.v = {}; this.focused = null; this.last = null; this.touched = new Set(); this.state = {}; this.errors = new Set();
    this.started = false; this.attempted = false; this.success = false; this.reachedForm = false; this.lastAttempt = null; this.blocked = []; }
  kind(k) { return KIND[k] ?? "text"; }
  filledNow(k) { const v = this.v[k]; return this.kind(k) === "check" ? v === true : !!(v && String(v).trim()); }
  validNow(k) { const v = this.v[k]; if (this.kind(k) !== "text") return this.filledNow(k); return this.filledNow(k) && (CHECK[k] ?? (() => true))(String(v).trim()); }
  required() {
    return ORDER.filter((k) => !["universityName"].includes(k) && (k !== "course" && k !== "university" || this.v.status === "student") && (k !== "confirmRelocation" || this.v.relocation !== "no"));
  }
  shown(k) { return k === "course" ? this.v.status === "student" : k === "confirmRelocation" ? this.v.relocation !== "no" : true; }
  blur() {
    const k = this.focused; if (!k) return;
    this.state[k] = this.filledNow(k);
    if (this.filledNow(k) && !this.validNow(k)) this.errors.add(k);
    this.focused = null;
  }
  focusOn(k) { if (this.focused !== k) this.blur(); this.focused = k; this.last = k; this.touched.add(k); this.started = true; this.reachedForm = true; }
  async focus(k) { await this.p.locator(SEL[k]).focus(); this.focusOn(k); }
  async fill(k, value) {
    await this.focus(k);
    const el = this.p.locator(SEL[k]);
    if (this.kind(k) === "select") { await el.selectOption(value); this.v[k] = value; this.state[k] = !!value; }
    else if (this.kind(k) === "check") { await el.setChecked(value); this.v[k] = value; this.state[k] = value; }
    else { await el.fill(value); this.v[k] = value; TYPED.push(value); }
    if (k === "status" && value !== "student") this.v.course = undefined;
    if (k === "relocation" && value === "no") this.v.confirmRelocation = false;
  }
  async scrollToForm() { await this.p.locator("#ttForm").scrollIntoViewIfNeeded(); await this.p.waitForTimeout(400); this.reachedForm = true; }
  async submit({ fail = false } = {}) {
    this.blur();
    this.attempted = true; this.started = true; this.reachedForm = true;
    this.lastAttempt = ORDER.filter((k) => this.filledNow(k));
    await this.p.click('#ttForm [type="submit"]');
    const missing = this.required().filter((k) => !this.validNow(k));
    if (missing.length) {
      missing.forEach((k) => this.errors.add(k));
      this.blocked.push(...missing);
      await this.p.waitForTimeout(700);           // the page focuses the first missing question
      this.focusOn(missing[0]);
      return;
    }
    await this.p.waitForTimeout(800);
    if (!fail) this.success = true;
  }
}

const FULL = [["name", "Aruzhan Test"], ["email", "aru@test.kz"], ["phone", "+7 701 000 00 00"], ["telegram", "@aru_test"], ["city", "almaty"], ["age", "21"]];
const TAIL = [["university", "it"], ["english", "b2"], ["relocation", "yes"], ["confirmRelocation", true], ["confirmData", true]];
const fillAll = async (v, list) => { for (const [k, x] of list) await v.fill(k, x); };

const SCENARIOS = [
  ["before form", {}, async () => {}],
  ["before form", { utm_source: "instagram" }, async () => {}],
  ["before form", {}, async () => {}],
  ["saw form", {}, async (v) => v.scrollToForm()],
  ["saw form", { utm_source: "telegram" }, async (v) => v.scrollToForm()],
  ["left on name", {}, async (v) => { await v.scrollToForm(); await v.fill("name", "Ab"); }],
  ["left on name", { utm_source: "telegram" }, async (v) => { await v.fill("name", "Bo"); }],
  ["left on name", {}, async (v) => { await v.focus("name"); }],
  ["bad email, left on phone", {}, async (v) => { await v.fill("name", "Cara"); await v.fill("email", "bad"); await v.focus("phone"); }],
  ["left on email", {}, async (v) => { await v.fill("name", "Dan"); await v.fill("email", "dan@x.kz"); }],
  ["left on telegram", {}, async (v) => { await fillAll(v, FULL.slice(0, 3)); await v.fill("telegram", "nick"); }],
  ["left on telegram", { utm_source: "instagram" }, async (v) => { await fillAll(v, FULL.slice(0, 3)); await v.fill("telegram", "@nick_ok"); }],
  ["left on city", {}, async (v) => { await fillAll(v, FULL.slice(0, 4)); await v.focus("city"); }],
  ["student, left on course", {}, async (v) => { await fillAll(v, FULL); await v.fill("status", "student"); await v.focus("course"); }],
  ["student, left on course", { utm_source: "telegram" }, async (v) => { await fillAll(v, FULL); await v.fill("status", "student"); await v.focus("course"); }],
  ["left on university", {}, async (v) => { await fillAll(v, FULL); await v.fill("status", "working"); await v.focus("university"); }],
  ["left on english", {}, async (v) => { await fillAll(v, FULL); await v.fill("status", "working"); await v.fill("university", "biz"); await v.focus("english"); }],
  ["not relocating, left", {}, async (v) => { await fillAll(v, FULL); await v.fill("status", "freelance"); await v.fill("english", "c1"); await v.fill("relocation", "no"); }],
  ["empty submit, left", {}, async (v) => { await v.scrollToForm(); await v.submit(); }],
  ["empty submit, left", { utm_source: "instagram" }, async (v) => { await v.scrollToForm(); await v.submit(); }],
  ["forgot consent, then sent", {}, async (v) => { await fillAll(v, FULL); await v.fill("status", "working"); await fillAll(v, TAIL.slice(0, 4)); await v.submit(); await v.fill("confirmData", true); await v.submit(); }],
  ["student, sent", { utm_source: "telegram" }, async (v) => { await fillAll(v, FULL); await v.fill("status", "student"); await v.fill("course", "3"); await fillAll(v, TAIL); await v.submit(); }],
  ["working, sent", {}, async (v) => { await fillAll(v, FULL); await v.fill("status", "working"); await fillAll(v, TAIL); await v.submit(); }],
  ["english page, sent", {}, async (v) => { await v.p.click('.lang button[data-lang="en"]'); await v.p.waitForTimeout(400); await fillAll(v, FULL); await v.fill("status", "searching"); await fillAll(v, TAIL); await v.submit(); }],
  ["not relocating, sent", {}, async (v) => { await fillAll(v, FULL); await v.fill("status", "working"); await fillAll(v, [["english", "b1"], ["relocation", "no"], ["confirmData", true]]); await v.submit(); }],
  ["apps script fails", {}, async (v) => { await fillAll(v, FULL); await v.fill("status", "working"); await fillAll(v, TAIL); await v.submit({ fail: true }); }, { fail: true }],
  ["mobile, sent", { utm_source: "telegram" }, async (v) => { await fillAll(v, FULL); await v.fill("status", "working"); await fillAll(v, TAIL); await v.submit(); }, { width: 375 }],
];

const browser = await chromium.launch(LAUNCH);
const visits = [];
const pageErrors = [];
const open = [];
for (const [name, utm, act, opts = {}] of SCENARIOS) {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: 900 }, reducedMotion: "reduce" });
  await serve(ctx, html, { collector: TRACKER, appsScript: () => (opts.fail ? { status: 500, ok: false } : { ok: true }) });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => pageErrors.push(`${name}: ${e.message}`));
  const q = new URLSearchParams({ tt_debug: "1", ...utm, utm_content: `v${visits.length + 1}` });
  await p.goto(`${LANDING}?${q}`);
  await p.waitForTimeout(600);
  const v = new Visit(p);
  v.name = name; v.utm = utm.utm_source ?? null; v.mobile = (opts.width ?? 1280) < 768;
  await act(v);
  await p.waitForTimeout(300);
  await p.close({ runBeforeUnload: true }); // closing the tab: pagehide → the page sends its summary with sendBeacon
  open.push(ctx);                         // closing a context at once would cut beacons still in flight
  visits.push(v);
}
await new Promise((r) => setTimeout(r, 4000));
for (const c of open) await c.close();
// one visit that looks like a bot (navigator.webdriver) and has no tt_debug: must not be recorded
const before = await db.analyticsSession.count({ where: { formId: FORM } });
{
  const ctx = await browser.newContext(); await serve(ctx, html, { collector: TRACKER });
  const p = await ctx.newPage(); await p.goto(LANDING); await p.waitForTimeout(1500); await p.close({ runBeforeUnload: true }); await new Promise((r) => setTimeout(r, 1500)); await ctx.close();
}
const botRecorded = (await db.analyticsSession.count({ where: { formId: FORM } })) - before;
await new Promise((r) => setTimeout(r, 1500));

// ── expected numbers, from what the visits did ──
const exp = { sessions: visits.length, reachedForm: 0, started: 0, attempted: 0, success: 0, fields: {}, blocked: {} };
for (const k of ORDER) exp.fields[k] = { reached: 0, filled: 0, left: 0, errors: 0 };
for (const v of visits) {
  if (v.reachedForm) exp.reachedForm++;
  if (v.started) exp.started++;
  if (v.attempted) exp.attempted++;
  if (v.success) exp.success++;
  const depth = Math.max(-1, ...[...v.touched].map((k) => ORDER.indexOf(k)));
  for (const [i, k] of ORDER.entries()) {
    const reached = v.started && (v.attempted || depth >= i || v.touched.has(k)) && (!COND.has(k) || v.shown(k));
    if (!reached) continue;
    exp.fields[k].reached++;
    if (v.state[k] === true || (v.lastAttempt ?? []).includes(k)) exp.fields[k].filled++;
    if (v.errors.has(k)) exp.fields[k].errors++;
  }
  if (!v.success && v.started && v.last) exp.fields[v.last].left++;
  for (const k of new Set(v.blocked)) exp.blocked[k] = (exp.blocked[k] ?? 0) + 1;
}

// ── what the dashboard says ──
const browser2 = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const ctx = await browser2.newContext({ viewport: { width: 1400, height: 1000 } });
const p = await ctx.newPage();
for (let i = 0; i < 3 && !(await p.url()).includes("/forms"); i++) {
  await p.goto(`${TRACKER}/login`, { waitUntil: "networkidle" });
  await p.fill('input[type="email"]', "demo@x.kz"); await p.fill('input[type="password"]', "demo12345");
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  await p.goto(`${TRACKER}/forms/${FORM}?test=1`, { waitUntil: "networkidle" });
}
await p.screenshot({ path: process.env.SHOT ?? "/tmp/forms-report.png", fullPage: true });
const shown = await p.evaluate(() => {
  const num = (s) => Number(String(s).replace(/[^\d.]/g, "")) || 0;
  const tables = [...document.querySelectorAll("table")];
  const q = tables.find((t) => t.querySelector("th")?.textContent === "Question");
  const fields = Object.fromEntries([...q.querySelectorAll("tbody tr")].map((tr) => {
    const td = [...tr.querySelectorAll("td")].map((x) => x.textContent.trim());
    return [td[0].replace(/conditional.*/, "").trim(), { reached: num(td[1]), filled: num(td[2]), left: num(td[3]), errorRate: td[5] }];
  }));
  const funnel = Object.fromEntries([...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === "Funnel")
    .querySelectorAll(".grid").length ? [...[...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === "Funnel").querySelectorAll(".grid")]
    .map((g) => [g.children[0].textContent.trim(), num(g.children[2].childNodes[0].textContent)]) : []);
  const blocked = Object.fromEntries([...[...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent.startsWith("Blocked")).querySelectorAll(".grid")]
    .map((g) => [g.children[0].textContent.trim(), num(g.children[2].textContent)]));
  return { fields, funnel, blocked };
});
await browser.close(); await browser2.close();

const LABEL = { name: "Full name", email: "Email", phone: "Phone", telegram: "Telegram", city: "City", age: "Age", status: "Background", course: "Year of study",
  university: "Field of study", universityName: "University", english: "English level", relocation: "Ready to relocate", confirmRelocation: "Relocation confirmation", confirmData: "Data consent" };
let bad = 0;
const check = (what, got, want) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? "✓" : "✗"} ${what}: dashboard ${got}, expected ${want}`); };
check("sessions", shown.funnel["Sessions on the page"], exp.sessions);
check("reached the form", shown.funnel["Reached the form"], exp.reachedForm);
check("started", shown.funnel["Started filling in"], exp.started);
check("pressed send", shown.funnel["Pressed «Send»"], exp.attempted);
check("sent", shown.funnel["Sent successfully"], exp.success);
for (const k of ORDER) {
  const d = shown.fields[LABEL[k]], e = exp.fields[k];
  check(`${k}: reached`, d.reached, e.reached);
  check(`${k}: filled`, d.filled, e.filled);
  check(`${k}: left here`, d.left, e.left);
  const er = e.reached ? `${((e.errors / e.reached) * 100).toFixed(1)}%` : "—";
  check(`${k}: error rate`, d.errorRate, er);
}
for (const [k, n] of Object.entries(exp.blocked)) check(`blocked on ${k}`, shown.blocked[LABEL[k]], n);
check("bot visit recorded", botRecorded, 0);
check("JS errors on the page", pageErrors.length, 0);
if (pageErrors.length) console.log(pageErrors);

// ── nothing typed may be stored ──
const events = await db.analyticsEvent.findMany({ where: { session: { formId: FORM } }, select: { meta: true } });
const sessions = await db.analyticsSession.findMany({ where: { formId: FORM } });
const blob = JSON.stringify(events) + JSON.stringify(sessions);
const leaked = [...new Set(TYPED)].filter((t) => t.length > 2 && !/^\d+$/.test(t) && blob.includes(t));
check("typed text values found in the DB", leaked.length, 0);
if (leaked.length) console.log("leaked:", leaked);
console.log(`${events.length} events, ${sessions.length} sessions in the DB`);
const got = new Set(sessions.map((x) => x.utmContent));
const missing = visits.map((v, i) => [`v${i + 1}`, v.name]).filter(([c]) => !got.has(c));
if (missing.length) { bad++; console.log("✗ visits with no session in the DB:", missing); }
await db.$disconnect();
console.log(bad ? `${bad} mismatch(es)` : "dashboard matches");
process.exit(bad ? 1 : 0);
