/**
 * End-to-end check of the form analytics in /t.js, in a real browser: a page
 * shaped like a Tilda form (required fields, phone mask, Cyrillic select,
 * consent tick, success box + tildaform:aftersuccess) is visited a few times;
 * the beacons go through the real collector into the database, and the
 * dashboard's report is compared with what the visits did. Also checks that
 * nothing typed reached the database and that the TopTalents landing's own
 * form (#tt) is left alone.
 *
 *   DATABASE_URL=postgresql://…/utm_test npx tsx scripts/check-form-autodiscovery.ts
 */
import { execSync } from "node:child_process";
import http from "node:http";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { buildSnippetJs } from "@/lib/snippet";
import * as collect from "@/app/api/collect/route";
import { report } from "@/lib/formAnalytics/report";
import { resetProjectCache } from "@/lib/formAnalytics/project";

const require = createRequire(import.meta.url);
const { chromium } = require(execSync("npm root -g").toString().trim() + "/playwright");

const db = new PrismaClient();
const tag = `e2e${Date.now().toString(36)}`;
const HOST = `${tag}.tilda.ws`;
const PAGE = `https://${HOST}/reg`;
let TRACKER = ""; // a local server that hands the beacons to the real collector
const FORM = `${HOST}_reg:form123`;
const TYPED = ["Айгерим Тестова", "aigerim@", "aigerim@mail.kz", "+7 701 555 44 33"];

const html = (extra = "") => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Регистрация</title>
<script src="${TRACKER}/t.js" async></script></head><body>
<div style="height:1200px">first screen</div>
<div class="t-rec"><div class="t-section__title">Регистрация на проект</div>
<form id="form123" name="form123" class="t-form js-form-proccess" novalidate>
  <div class="t-input-group"><div class="t-input-title">Ваше имя</div><input class="t-input" id="nm" name="Name" data-tilda-req="1" data-tilda-rule="name"></div>
  <div class="t-input-group"><div class="t-input-title">Email</div><input class="t-input" id="em" name="Email" type="email" data-tilda-req="1" data-tilda-rule="email"></div>
  <div class="t-input-group"><div class="t-input-title">Телефон</div><input class="t-input t-input-phonemask" id="ph" type="tel" data-tilda-req="1" data-tilda-rule="phone"><input type="hidden" name="Phone" class="js-phonemask-result"></div>
  <div class="t-input-group"><div class="t-input-title">Город</div><select id="ct" name="Город"><option value="">—</option><option value="Алматы">Алматы</option><option value="Астана">Астана</option></select></div>
  <div class="t-input-group t-input-group_cb"><label class="t-checkbox__control"><input id="ok" type="checkbox" name="Checkbox" value="yes" data-tilda-req="1"><div class="t-checkbox__labeltext">Согласен на обработку данных</div></label></div>
  <div class="js-successbox t-form__successbox" style="display:none"></div>
  <button type="submit" class="t-submit">Отправить</button>
</form></div>
<div style="height:1500px"></div>
${extra}
<script>
  // what Tilda does: the mask fills the hidden input, required fields are checked, then a success box
  var f = document.getElementById("form123");
  f.querySelector(".t-input-phonemask").addEventListener("input", function (e) { f.elements.Phone.value = e.target.value; });
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var bad = 0;
    f.querySelectorAll(".t-input-group").forEach(function (g) {
      var el = g.querySelector('[data-tilda-req="1"]');
      g.classList.remove("js-error-control-box");
      if (!el) return;
      var empty = el.type === "checkbox" ? !el.checked : !el.value.trim();
      if (empty) { g.classList.add("js-error-control-box"); bad++; }
    });
    if (bad) return;
    setTimeout(function () {
      var b = f.querySelector(".js-successbox"); b.textContent = "Спасибо!"; b.style.display = "block";
      f.dispatchEvent(new CustomEvent("tildaform:aftersuccess", { bubbles: true }));
    }, 300);
  });
</script></body></html>`;

let posted = 0;
async function newPage(browser: { newContext: (o: object) => Promise<any> }, path: string, extra = "") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148" });
  // the analytics skips robots, and Playwright's browser says it is one
  await ctx.addInitScript({ content: "Object.defineProperty(navigator, \"webdriver\", { get: function () { return false; } });" });
  await ctx.route(`https://${HOST}/**`, (r: any) => r.fulfill({ contentType: "text/html", body: html(extra) }));
  const page = await ctx.newPage();
  page.on("pageerror", (e: Error) => console.error("page error:", e.message));
  page.on("console", (m: any) => { if (process.env.DEBUG) console.log("console:", m.text()); });
  page.on("requestfailed", (q: any) => { if (process.env.DEBUG) console.log("failed:", q.url(), q.failure()?.errorText); });
  await page.goto(`https://${HOST}${path}`);
  await page.waitForTimeout(500);
  return { ctx, page };
}

async function leave(v: { ctx: any; page: any }) {
  await v.page.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 800));
  await v.ctx.close();
}

const checks: [string, boolean, unknown?][] = [];
const expectEq = (name: string, got: unknown, want: unknown) => checks.push([name, JSON.stringify(got) === JSON.stringify(want), { got, want }]);

function startTracker(): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    const cors = { "access-control-allow-origin": `https://${HOST}` };
    if (req.url === "/t.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end(buildSnippetJs(TRACKER)); }
    if (req.url !== "/api/collect" || req.method !== "POST") { res.writeHead(204, cors); return res.end(); }
    let body = "";
    for await (const chunk of req) body += chunk;
    const out = await collect.POST(new NextRequest(TRACKER + "/api/collect", {
      method: "POST", body, headers: { "content-type": "text/plain", origin: String(req.headers.origin ?? ""), "x-forwarded-for": "10.0.0.7" },
    }));
    posted++;
    if (out.status !== 200) console.error("collector said", out.status, await out.text());
    res.writeHead(out.status, cors);
    res.end("{}");
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => {
    TRACKER = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    ok(server);
  }));
}

async function main() {
  const server = await startTracker();
  const c = await db.campaign.create({ data: { name: `${tag} Reg S'27`, label: `${tag} Reg S'27` } });
  await db.trackingLink.create({ data: { name: tag, slug: `${tag}-ig`, destinationUrl: PAGE, campaignId: c.id, utmCampaign: c.name, utmSource: "instagram" } });
  resetProjectCache();
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    // a public page sending to a local server: let Chromium allow it, as the real tracker is public
    args: ["--disable-features=PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests,LocalNetworkAccessChecks"],
  });
  try {
    // 1. Came from Instagram, typed a name and a wrong e-mail, left.
    let v = await newPage(browser, `/reg?utm_source=instagram&utm_campaign=${encodeURIComponent(c.name)}`);
    await v.page.locator("#form123").scrollIntoViewIfNeeded();
    await v.page.fill("#nm", TYPED[0]);
    await v.page.fill("#em", TYPED[1]);
    await v.page.focus("#ph");
    await v.page.waitForTimeout(300);
    await leave(v);

    // 2. Pressed «Send» with the phone and the tick missing, then fixed it and sent.
    v = await newPage(browser, "/reg");
    await v.page.locator("#form123").scrollIntoViewIfNeeded();
    await v.page.fill("#nm", TYPED[0]);
    await v.page.fill("#em", TYPED[2]);
    await v.page.selectOption("#ct", "Алматы");
    await v.page.click(".t-submit");
    await v.page.waitForTimeout(1200);
    await v.page.fill("#ph", TYPED[3]);
    await v.page.check("#ok");
    await v.page.click(".t-submit");
    await v.page.waitForTimeout(1500);
    await leave(v);

    // 3. Opened the page and left without scrolling to the form.
    v = await newPage(browser, "/reg");
    await leave(v);

    // 4. Test visit (?tt_debug=1), and a page that also has the TopTalents form: that one is not tracked twice.
    v = await newPage(browser, "/reg?tt_debug=1", `<div id="tt"><form id="ttForm"><input name="name"></form></div>`);
    await v.page.fill("#nm", "x");
    await leave(v);
  } finally {
    await browser.close();
  }
  server.close();
  await new Promise((r) => setTimeout(r, 500));

  const form = await db.analyticsForm.findUnique({ where: { id: FORM } });
  if (!form) console.error("no form; batches:", posted, (await db.analyticsForm.findMany({ where: { id: { contains: tag } }, select: { id: true } })).map((f) => f.id));
  const all = await db.analyticsForm.findMany({ where: { id: { startsWith: HOST } }, select: { id: true } });
  expectEq("only the Tilda form is tracked (not #ttForm)", all.map((f) => f.id), [FORM]);
  expectEq("project from the page's link", form?.projectSlug, `${tag}reg-s27`);
  expectEq("title from the block", form?.title, "Регистрация на проект");
  expectEq("questions and labels", (form?.fields as { k: string; label: string; req: boolean; kind: string }[]).map((f) => `${f.k}|${f.kind}|${f.req}|${f.label}`), [
    "Name|text|true|Ваше имя", "Email|text|true|Email", "Phone|text|true|Телефон", "q4|select|false|Город", "Checkbox|check|true|Согласен на обработку данных",
  ]);

  const sessions = await db.analyticsSession.findMany({ where: { formId: FORM }, orderBy: { startedAt: "asc" } });
  expectEq("sessions (3 real + 1 test)", [sessions.length, sessions.filter((s) => s.isTest).length], [4, 1]);
  const [s1, s2, s3] = sessions.filter((s) => !s.isTest);
  expectEq("visit 1: from Instagram, left on Phone", [s1?.utmSource, s1?.outcome, s1?.lastField, s1?.device], ["instagram", "abandoned", "Phone", "mobile"]);
  expectEq("visit 2: sent, chose Алматы, ticked consent", [s2?.outcome, s2?.answers], ["success", { q4: "Алматы", Checkbox: "yes" }]);
  expectEq("visit 3: left before the form", [s3?.outcome, s3?.lastField], ["abandoned", null]);

  const r = await report({ formId: FORM });
  expectEq("funnel: sessions / reached / started / attempted / sent", [r.funnel.sessions, r.funnel.reachedForm, r.funnel.started, r.funnel.attempted, r.funnel.success], [3, 2, 2, 1, 1]);
  const row = (k: string) => r.fields.find((x) => x.k === k);
  expectEq("Phone: left here 1", row("Phone")?.leftHere, 1);
  expectEq("Email: error on blur in visit 1", (row("Email")?.errorRate ?? 0) > 0, true);
  expectEq("blocked on Send: Phone and the tick", r.blocked.map((b) => b.k).sort(), ["Checkbox", "Phone"]);

  const events = await db.analyticsEvent.findMany({ where: { session: { formId: FORM } } });
  const dump = JSON.stringify([events, sessions]);
  expectEq("nothing typed is stored", TYPED.filter((t) => dump.includes(t)), []);

  let ok = true;
  for (const [name, pass, detail] of checks) {
    console.log(`${pass ? "✓" : "✗"} ${name}${pass ? "" : " " + JSON.stringify(detail)}`);
    ok &&= pass;
  }
  console.log(`${checks.filter((c) => c[1]).length}/${checks.length} checks, ${posted} batches`);

  await db.analyticsForm.deleteMany({ where: { id: { startsWith: HOST } } });
  await db.trackingLink.deleteMany({ where: { slug: `${tag}-ig` } });
  await db.campaign.delete({ where: { id: c.id } });
  await db.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
