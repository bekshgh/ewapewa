#!/usr/bin/env node
/**
 * Builds the five Tilda insertion parts from src/ into dist/:
 *   part1.html  page settings → HEAD:        CSS (#tt) + image loader
 *   part2.html  T123 block:                  markup
 *   part3.html  page settings → before </body>: English strings + page script + image loader
 *   part4.html  site settings → HEAD:        HN font + image loader
 *   part5.html  site settings → before </body>: image loader
 * No dependencies; images and fonts are copied as the same base64, never re-encoded.
 *
 *   node scripts/build.mjs [--out dir] [--collector URL] [--apps-script URL]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const OUT = resolve(ROOT, arg("--out") ?? "dist");
const read = (p) => readFileSync(join(SRC, p), "utf8");
const manifest = JSON.parse(read("assets/manifest.json"));

/** The same loader the page always had: images are put into <img data-a> by key. */
function imageLoader(part) {
  const list = manifest.images[String(part)] ?? [];
  if (!list.length) return "";
  const lines = list.map((img) => {
    const b64 = read(`assets/images/${img.file}`).trim();
    return `${img.key}:"data:${img.mime};base64,${b64}"${img.comma ? "," : ""}`;
  });
  return (
    "<script>\n/* картинки: подставляются в разметку по data-a */\n(function(){var A={\n" +
    lines.join("\n") +
    '\n};function go(){document.querySelectorAll("#tt img[data-a]").forEach(function(i){\n' +
    'var v=A[i.getAttribute("data-a")];if(v)i.src=v})}\n' +
    'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();})();\n</script>\n'
  );
}

function fonts() {
  return (
    "<style>\n" +
    manifest.fonts
      .map((f) => {
        const b64 = read(`assets/fonts/${f.file}`).trim();
        return `@font-face{font-family:"HN";font-style:normal;font-weight:${f.weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
      })
      .join("\n") +
    "\n</style>\n"
  );
}

/** English strings for [data-i] elements, in the page's compact array form. */
function englishStrings() {
  const en = JSON.parse(read("i18n/en.json"));
  return (
    "/* английские строки вынесены из разметки, чтобы блок T123 влез в лимит Tilda */\n" +
    `(function(){var E=${JSON.stringify(en)};\n` +
    'var n=document.querySelectorAll("#tt [data-i]");\n' +
    'for(var k=0;k<n.length;k++){var d=E[+n[k].getAttribute("data-i")];if(!d)continue;\n' +
    'if(d.t!=null)n[k].setAttribute("data-en",d.t);\n' +
    'if(d.p!=null)n[k].setAttribute("data-en-placeholder",d.p);\n' +
    'if(d.a!=null)n[k].setAttribute("data-en-aria",d.a);\n' +
    'if(d.l!=null)n[k].setAttribute("data-en-alt",d.l);}})();\n'
  );
}

/**
 * The page script: modules share one closure (they were one IIFE before the
 * split), in this order. Config values can be overridden for local testing.
 */
const MODULES = ["config", "i18n", "analytics", "countdown", "ui-effects", "form", "main"];
function pageScript() {
  const overrides = {
    __COLLECTOR_URL__: arg("--collector"),
    __APPS_SCRIPT_URL__: arg("--apps-script"),
  };
  const ui = read("i18n/ui.json");
  let body = MODULES.map((m) => `/* ── ${m}.js ── */\n` + read(`js/${m}.js`).trimEnd() + "\n").join("");
  body = body.replace("__UI_STRINGS__", JSON.stringify(JSON.parse(ui)));
  for (const [k, v] of Object.entries(overrides)) {
    if (v) body = body.replace(new RegExp(`/\\*${k}\\*/'[^']*'`), JSON.stringify(v));
  }
  return '(function(){\n  "use strict";\n' + body + "})();\n";
}

function part3() {
  const legacy = join(SRC, "js/legacy.js");
  const script = existsSync(legacy) ? readFileSync(legacy, "utf8") : englishStrings() + "\n" + pageScript();
  return "<script>\n" + script + "</script>\n" + imageLoader(3);
}

const M = manifest.markers;
const parts = {
  1: M["1"] + "\n<style>\n" + read("css/main.css") + "</style>\n" + imageLoader(1),
  2: M["2"] + "\n" + read("html/page.html"),
  3: M["3"] + "\n" + part3(),
  4: M["4"] + "\n" + fonts() + imageLoader(4),
  5: M["5"] + "\n" + imageLoader(5),
};

mkdirSync(OUT, { recursive: true });
const sizes = [];
for (const [n, html] of Object.entries(parts)) {
  writeFileSync(join(OUT, `part${n}.html`), html);
  sizes.push([`part${n}.html`, Buffer.byteLength(html)]);
}
writeFileSync(join(OUT, "all.html"), Object.values(parts).join(""));
for (const [f, b] of sizes) console.log(`${f.padEnd(12)} ${String(b).padStart(7)} bytes  (${(b / 1024).toFixed(1)} KB)`);
console.log(`→ ${OUT}`);
