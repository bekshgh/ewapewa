import type { NextRequest } from "next/server";

/** Where a sign-up came from, so admins can tell who is asking for access. No IP is kept. */
export interface SignupInfo {
  city?: string;
  country?: string;
  device?: "mobile" | "tablet" | "desktop";
  os?: string;
  browser?: string;
  lang?: string;
  /** the site the person opened the sign-up page from, e.g. "t.me" */
  from?: string;
}

const OS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];
const BROWSER: [RegExp, string][] = [
  [/YaBrowser/, "Yandex"],
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung"],
  [/Firefox|FxiOS/, "Firefox"],
  [/Chrome|CriOS/, "Chrome"],
  [/Safari/, "Safari"],
];

const first = (ua: string, list: [RegExp, string][]) => list.find(([re]) => re.test(ua))?.[1];

export function deviceOf(ua: string): SignupInfo["device"] {
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return ua ? "desktop" : undefined;
}

/** Host of the page the visitor came from; our own site is not a source. */
function hostOf(referrer: unknown, ownHost: string | null): string | undefined {
  if (typeof referrer !== "string" || !referrer) return undefined;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host && host !== ownHost ? host.slice(0, 80) : undefined;
  } catch {
    return undefined;
  }
}

export function signupInfo(req: NextRequest, referrer?: unknown): SignupInfo {
  const h = req.headers;
  const ua = h.get("user-agent") ?? "";
  const city = h.get("x-vercel-ip-city");
  const info: SignupInfo = {
    city: city ? decodeURIComponent(city).slice(0, 80) : undefined,
    country: h.get("x-vercel-ip-country")?.slice(0, 2) || undefined,
    device: deviceOf(ua),
    os: first(ua, OS),
    browser: first(ua, BROWSER),
    lang: h.get("accept-language")?.split(",")[0]?.trim().slice(0, 12) || undefined,
    from: hostOf(referrer, h.get("host")?.split(":")[0] ?? null),
  };
  return Object.fromEntries(Object.entries(info).filter(([, v]) => v)) as SignupInfo;
}
