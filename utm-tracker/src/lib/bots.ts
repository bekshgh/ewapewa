/**
 * Requests to a short link that are not a person following it: messenger and
 * social link previews (Telegram, WhatsApp, Facebook…), search crawlers,
 * uptime checkers and scripts, browser prefetches. They still get redirected
 * (so previews work) but are not counted as clicks.
 */

const BOT_UA = new RegExp(
  [
    "bot\\b", "bot/", "crawl", "spider", "slurp", "scrap", "preview", "externalhit", "meta-externalagent", "facebookcatalog",
    "whatsapp", "vkshare", "skypeuripreview", "embedly", "iframely", "headless", "phantomjs", "puppeteer",
    "playwright", "selenium", "lighthouse", "pagespeed", "gtmetrix", "pingdom", "uptime", "monitor", "scanner", "validator",
    "curl/", "wget", "python", "go-http-client", "java/", "okhttp", "axios", "node-fetch", "undici", "httpclient", "libwww",
    "aiohttp", "postman", "insomnia", "zgrab", "masscan", "nmap",
  ].join("|"),
  "i",
);
// phone brands that end in "bot"
const NOT_BOT = /cubot/i;

export interface RequestInfo {
  method?: string;
  userAgent: string | null;
  acceptLanguage: string | null;
  purpose: string | null; // Sec-Purpose / Purpose header
}

export function botReason(r: RequestInfo): string | null {
  const ua = (r.userAgent ?? "").trim();
  if (r.method === "HEAD") return "head";
  if (/prefetch|prerender/i.test(r.purpose ?? "")) return "prefetch";
  if (!ua) return "no-ua";
  if (BOT_UA.test(ua) && !NOT_BOT.test(ua)) return "bot-ua";
  // every real browser and in-app webview sends it; scripts with a borrowed UA usually don't
  if (!r.acceptLanguage) return "no-accept-language";
  return null;
}

export const isBotRequest = (r: RequestInfo) => botReason(r) !== null;

/** A repeat from the same device on the same link within this window is the same click. */
export const REPEAT_WINDOW_MS = 30_000;
