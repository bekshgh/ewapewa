// The refactored page must render and behave exactly like the original one:
// same #tt DOM after load and after each form scenario.
import { chromium, page, serve, LANDING } from "./harness.mjs";

const ORIGINAL = page(process.env.ORIG_DIR), NEW = page(process.env.NEW_DIR || "dist");
const OPEN_TIME = new Date("2026-09-05T12:00:00+05:00");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());

async function run(html, steps, { reduced = true, time = OPEN_TIME, width = 1280 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  await serve(ctx, html);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await p.clock.install({ time });
  await p.goto(LANDING);
  await p.clock.runFor(2500);
  const snaps = {};
  for (const [name, fn] of steps) {
    await fn(p);
    await p.clock.runFor(1500);
    snaps[name] = await p.evaluate(() => {
      const tt = document.getElementById("tt").cloneNode(true);
      tt.querySelectorAll("canvas").forEach((c) => c.remove());
      tt.querySelectorAll(".cd-s").forEach((c) => c.classList.remove("dim"));
      const prog = tt.querySelector("#ttProg"); const progW = prog.style.width; prog.removeAttribute("style");
      // scroll-driven state (reveal, progress, pinned track, agenda line, tagline) depends on timing, not on code
      tt.querySelectorAll(".rv,.stage,.ag-i,.w,[aria-current]").forEach((e) => { e.classList.remove("in", "now", "on", "lit"); e.removeAttribute("aria-current"); });
      tt.querySelectorAll("#ttTrack,#ttPinRail,.ag-fill").forEach((e) => e.removeAttribute("style"));
      // intended fix: the university label no longer reverts to the markup text after a language switch
      const uni = tt.querySelector("#ttUniLabel"); if (uni) uni.textContent = "";
      return { html: tt.outerHTML, title: document.title, lang: document.documentElement.lang, geo: [document.documentElement.scrollHeight, Math.round(scrollY), progW].join(" ") };
    });
  }
  await ctx.close();
  return { snaps, errors };
}

const fill = async (p, data) => {
  for (const [sel, v] of Object.entries(data)) {
    const el = p.locator(sel);
    const tag = await el.evaluate((e) => e.tagName + (e.type === "checkbox" ? ":cb" : ""));
    if (tag === "SELECT") await el.selectOption(v);
    else if (tag.endsWith(":cb")) await el.setChecked(v);
    else await el.fill(v);
  }
};
const FULL = { "#f-name": "Test Person", "#f-email": "t@e.kz", "#f-phone": "+7 701 000 00 00", "#f-tg": "@tester", "#f-city": "almaty",
  "#f-age": "21", "#f-status": "working", "#f-eng": "b2", "#f-reloc": "yes", "#f-c1": true, "#f-c2": true };

const SCENARIOS = {
  load: [["load", async () => {}]],
  "lang en → ru": [["en", async (p) => p.click('.lang button[data-lang="en"]')], ["ru", async (p) => p.click('.lang button[data-lang="ru"]')]],
  "empty submit": [["empty", async (p) => p.click('#ttForm [type="submit"]')]],
  "student": [["student", async (p) => fill(p, { "#f-status": "student" })], ["student→working", async (p) => fill(p, { "#f-status": "working" })]],
  "not relocating": [["no", async (p) => fill(p, { "#f-c1": true, "#f-reloc": "no" })], ["yes", async (p) => fill(p, { "#f-reloc": "yes" })]],
  "student empty submit": [["student-submit", async (p) => { await fill(p, { "#f-status": "student", "#f-name": "A" }); await p.click('#ttForm [type="submit"]'); }]],
  "en empty submit": [["en-submit", async (p) => { await p.click('.lang button[data-lang="en"]'); await p.clock.runFor(500); await fill(p, { "#f-name": "A B" }); await p.click('#ttForm [type="submit"]'); }]],
  "success": [["success", async (p) => { await fill(p, FULL); await p.click('#ttForm [type="submit"]'); }]],
  "faq + menu": [["faq", async (p) => { await p.click(".faq .q >> nth=0"); }]],
};

let failed = 0;
// after the deadline: form hidden, "closed" block, CTA texts changed
for (const opts of [{ time: new Date("2026-10-13T12:00:00+05:00") }, { time: new Date("2026-10-13T12:00:00+05:00"), width: 375 }]) {
  const steps = [["closed", async () => {}], ["closed-en", async (p) => p.click('.lang button[data-lang="en"]')]];
  const a = await run(ORIGINAL, steps, opts), b = await run(NEW, steps, opts);
  for (const k of Object.keys(a.snaps)) {
    const same = a.snaps[k].html === b.snaps[k].html;
    if (!same) failed++;
    console.log(`${same ? "✓" : "✗"} after deadline / ${k} ${opts.width ?? ""}`);
  }
  if (b.errors.length) { failed++; console.log("  JS errors (new):", b.errors); }
}
for (const [name, steps] of Object.entries(SCENARIOS)) {
  for (const opts of [{}, { reduced: false }, { width: 375 }]) {
    const a = await run(ORIGINAL, steps, opts), b = await run(NEW, steps, opts);
    for (const k of Object.keys(a.snaps)) {
      const same = a.snaps[k].html === b.snaps[k].html && a.snaps[k].title === b.snaps[k].title;
      if (!same) {
        failed++;
        const x = a.snaps[k].html, y = b.snaps[k].html;
        let i = 0; while (i < x.length && x[i] === y[i]) i++;
        console.log(`✗ ${name} / ${k} ${JSON.stringify(opts)}\n   orig: …${x.slice(Math.max(0, i - 120), i + 160)}\n   new:  …${y.slice(Math.max(0, i - 120), i + 160)}`);
      } else console.log(`✓ ${name} / ${k} ${JSON.stringify(opts)}`);
      if (a.snaps[k].geo !== b.snaps[k].geo) console.log(`   height/scroll: orig ${a.snaps[k].geo} | new ${b.snaps[k].geo}`);
    }
    if (b.errors.length) { failed++; console.log("  JS errors (new):", b.errors); }
    if (a.errors.length) console.log("  JS errors (original):", a.errors);
  }
}
await browser.close();
console.log(failed ? `${failed} difference(s)` : "identical");
process.exit(failed ? 1 : 0);
