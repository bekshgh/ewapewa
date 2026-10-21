import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, makeT, type Lang, type T } from "./index";

/** The viewer's interface language (cookie "lang"), for server components and route handlers. */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}

export async function getT(): Promise<T> {
  return makeT(await getLang());
}
