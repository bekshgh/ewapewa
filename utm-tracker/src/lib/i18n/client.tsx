"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LANG, LANG_COOKIE, makeT, type Lang, type T } from "./index";

const LangContext = createContext<Lang>(DEFAULT_LANG);

/** Set once in the layouts from the cookie, so client components translate like the server. */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

export function useT(): T {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}

/** Remember the choice for a year; the caller refreshes the page. */
export function saveLang(lang: Lang) {
  try {
    document.cookie = `${LANG_COOKIE}=${lang};path=/;max-age=31536000;SameSite=Lax`;
  } catch {}
}
