import { RU } from "./ru";

/**
 * Interface language: Russian (default) or English. The English text in the
 * code is the key; ru.ts holds the Russian for each. `{name}` placeholders are
 * filled from the second argument: t("Saved {n} links", { n: 3 }).
 * Pure: safe on the server and in the browser (see server.ts / client.tsx).
 */
export type Lang = "ru" | "en";
export const LANGS: Lang[] = ["ru", "en"];
export const DEFAULT_LANG: Lang = "ru";
export const LANG_COOKIE = "lang";

export type Vars = Record<string, string | number | null | undefined>;
export type T = (text: string, vars?: Vars) => string;

export const isLang = (v: unknown): v is Lang => v === "ru" || v === "en";

export function translate(lang: Lang, text: string, vars?: Vars): string {
  const s = lang === "ru" ? RU[text] ?? text : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k]))) : s;
}

export const makeT = (lang: Lang): T => (text, vars) => translate(lang, text, vars);

/** Russian plural: plural(n, "ссылка", "ссылки", "ссылок"); English picks one / other. */
export function plural(lang: Lang, n: number, one: string, few: string, many: string, enOne?: string, enOther?: string): string {
  if (lang === "en") return n === 1 ? enOne ?? one : enOther ?? many;
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
