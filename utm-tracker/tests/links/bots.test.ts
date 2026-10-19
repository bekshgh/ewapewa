import { describe, expect, it } from "vitest";
import { botReason, isOfflineLink } from "@/lib/bots";

const person = (userAgent: string) => ({ userAgent, acceptLanguage: "ru-RU,ru;q=0.9", purpose: null });

describe("short-link bot filter", () => {
  it("lets people through: browsers and in-app browsers", () => {
    for (const ua of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Telegram-Android/11.2.3 (Samsung SM-A546B; Android 14; SDK 34; HIGH)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.34.92",
      "Mozilla/5.0 (Linux; Android 13; CUBOT KINGKONG 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
    ]) expect(botReason(person(ua)), ua).toBeNull();
  });

  it("stops link previews and crawlers everywhere", () => {
    for (const ua of [
      "TelegramBot (like TwitterBot)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0 Safari/537.36",
    ]) {
      expect(botReason(person(ua)), ua).toBe("bot-ua");
      expect(botReason({ ...person(ua), offline: true }), ua).toBe("bot-ua");
    }
  });

  it("stops scripts on online links, but counts QR scanner apps on printed links", () => {
    for (const ua of ["curl/8.7.1", "python-requests/2.32.3", "Go-http-client/2.0", "okhttp/4.12.0", "QR Scanner/3.2 (Android)"]) {
      expect(botReason(person(ua)), ua).toBe("script-ua");
      expect(botReason({ ...person(ua), offline: true }), ua).toBeNull();
    }
    // Android's built-in HTTP client: a borrowed-looking UA, no Accept-Language
    const dalvik = { userAgent: "Dalvik/2.1.0 (Linux; U; Android 13; M2101K6G Build/TKQ1)", acceptLanguage: null, purpose: null };
    expect(botReason(dalvik)).toBe("no-accept-language");
    expect(botReason({ ...dalvik, offline: true })).toBeNull();
    expect(botReason({ userAgent: "", acceptLanguage: null, purpose: null, offline: true })).toBeNull();
  });

  it("knows a printed link by its tags or slug", () => {
    expect(isOfflineLink({ slug: "bc2-qr-banner", utmSource: "qr", utmMedium: "offline" })).toBe(true);
    expect(isOfflineLink({ slug: "poster-1", utmSource: "poster", utmMedium: null })).toBe(true);
    expect(isOfflineLink({ slug: "bc2-tg-telegram", utmSource: "telegram", utmMedium: "social" })).toBe(false);
    expect(isOfflineLink({ slug: "bc2-tg-qrcodes", utmSource: "telegram", utmMedium: "social" })).toBe(false);
  });

  it("stops prefetches, HEAD checks, empty agents and requests without Accept-Language", () => {
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
    expect(botReason({ ...person(chrome), purpose: "prefetch;prerender" })).toBe("prefetch");
    expect(botReason({ ...person(chrome), method: "HEAD" })).toBe("head");
    expect(botReason(person(""))).toBe("no-ua");
    expect(botReason({ ...person(chrome), acceptLanguage: null })).toBe("no-accept-language");
  });
});
