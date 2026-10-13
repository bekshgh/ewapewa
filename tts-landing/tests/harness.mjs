// Shared helpers for browser checks: the five parts are assembled the way Tilda
// puts them on the page and served at the real URL through request interception.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);
const pwPath = execSync("npm root -g").toString().trim() + "/playwright";
export const { chromium } = require(pwPath);
// a public page calling http://localhost needs Private Network Access checks off (test only)
export const LAUNCH = { executablePath: "/opt/pw-browsers/chromium", args: ["--disable-features=PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests,LocalNetworkAccessChecks"] };

export function page(dir) {
  const p = (n) => readFileSync(`${dir}/part${n}.html`, "utf8");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TopTalents</title><meta name="description" content="">${p(4)}${p(1)}</head><body>${p(2)}${p(3)}${p(5)}</body></html>`;
}

export const LANDING = "https://aiesecinkz.tilda.ws/toptalentssprint";

/** Serves `html` at LANDING, mocks Apps Script, forwards the collector (if any), blocks the rest. */
export async function serve(ctx, html, { collector, appsScript = () => ({ ok: true }) } = {}) {
  // the collector is not intercepted: beacons sent while leaving the page go out as in real life
  await ctx.route((u) => !(collector && u.href.startsWith(collector)), async (route) => {
    const url = route.request().url();
    if (url.startsWith(LANDING)) return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    if (url.startsWith("https://script.google.com/")) {
      const body = route.request().postData();
      const r = appsScript(body ? JSON.parse(body) : null);
      return route.fulfill({ status: r.status ?? 200, contentType: "application/json", body: JSON.stringify(r) });
    }
    return route.abort();
  });
}
