import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RU } from "@/lib/i18n/ru";
import { plural, translate } from "@/lib/i18n";

const SRC = path.resolve(__dirname, "../src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mts)$/.test(f) ? [p] : [];
  });

/** Every literal passed to t("…") / t(`…`) in the code, with the file it is in. */
function keysInCode() {
  const out: { key: string; file: string }[] = [];
  const re = /\bt\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const file of files(SRC).filter((f) => !f.includes(`${path.sep}i18n${path.sep}`))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) {
      if (m[1] === "`" && m[2].includes("${")) continue; // a computed key is not a literal
      out.push({ key: m[2].replace(/\\(["'`\\])/g, "$1"), file: path.relative(SRC, file) });
    }
  }
  return out;
}

describe("interface translations", () => {
  it("every t(\"…\") in the code has a Russian entry", () => {
    const missing = keysInCode().filter((k) => !(k.key in RU)).map((k) => `${k.file}: ${k.key}`);
    expect([...new Set(missing)]).toEqual([]);
  });

  it("keeps the placeholders of each entry", () => {
    const bad = Object.entries(RU).filter(([en, ru]) => {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
      return names(en) !== names(ru);
    });
    expect(bad).toEqual([]);
  });

  it("fills placeholders and picks Russian plural forms", () => {
    expect(translate("en", "Saved {n} links", { n: 3 })).toBe("Saved 3 links");
    expect(plural("ru", 1, "ссылка", "ссылки", "ссылок")).toBe("ссылка");
    expect(plural("ru", 3, "ссылка", "ссылки", "ссылок")).toBe("ссылки");
    expect(plural("ru", 11, "ссылка", "ссылки", "ссылок")).toBe("ссылок");
    expect(plural("ru", 21, "ссылка", "ссылки", "ссылок")).toBe("ссылка");
    expect(plural("en", 2, "ссылка", "ссылки", "ссылок", "link", "links")).toBe("links");
  });
});
