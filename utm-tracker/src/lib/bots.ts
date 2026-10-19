/**
 * Requests to a short link that are not a person following it. They still get
 * redirected (so previews work) but are not counted as clicks.
 *
 * - Sure: messenger / social link previews (Telegram, WhatsApp, Facebook…),
 *   search crawlers, headless browsers, HEAD checks, browser prefetches.
 * - Likely: plain HTTP libraries (okhttp, Dalvik, curl, python…), no
 *   User-Agent or no Accept-Language. On links shared online that is a script;
 *   but QR scanner apps open a scanned link exactly like that, so on offline
 *   links (QR codes, posters) these count as clicks.
 */

const SURE_BOT_UA = new RegExp(
  [
    "bot\\b", "bot/", "crawl", "spider", "slurp", "externalhit", "meta-externalagent", "facebookcatalog",
    "whatsapp", "vkshare", "skypeuripreview", "embedly", "iframely", "headless", "phantomjs", "puppeteer",
    "playwright", "selenium", "lighthouse", "pagespeed", "gtmetrix", "pingdom", "uptime",
  ].join("|"),
  "i",
);
const SCRIPT_UA = new RegExp(
  [
    "curl/", "wget", "python", "go-http-client", "java/", "okhttp", "axios", "node-fetch", "undici", "httpclient", "libwww",
    "aiohttp", "postman", "insomnia", "zgrab", "masscan", "nmap", "scrap", "preview", "monitor", "scanner", "validator",
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
  /** The link is printed (QR code, poster): scanner apps must count. */
  offline?: boolean;
}

export function botReason(r: RequestInfo): string | null {
  const ua = (r.userAgent ?? "").trim();
  if (r.method === "HEAD") return "head";
  if (/prefetch|prerender/i.test(r.purpose ?? "")) return "prefetch";
  if (ua && SURE_BOT_UA.test(ua) && !NOT_BOT.test(ua)) return "bot-ua";
  if (r.offline) return null;
  if (!ua) return "no-ua";
  if (SCRIPT_UA.test(ua) && !NOT_BOT.test(ua)) return "script-ua";
  // every real browser and in-app webview sends it; scripts with a borrowed UA usually don't
  if (!r.acceptLanguage) return "no-accept-language";
  return null;
}

export const isBotRequest = (r: RequestInfo) => botReason(r) !== null;

/** A printed link: a QR code or a poster, by its UTM tags or its slug ("bc2-qr-banner"). */
export function isOfflineLink(l: { slug: string; utmSource: string | null; utmMedium: string | null }): boolean {
  return /^(qr|offline|print|poster|flyer)$/i.test(l.utmSource ?? "") || /^(qr|offline|print)$/i.test(l.utmMedium ?? "") || /(^|-)qr(-|$)/i.test(l.slug);
}

/** A repeat from the same device on the same link within this window is the same click. */
export const REPEAT_WINDOW_MS = 30_000;
