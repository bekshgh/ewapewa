import { describe, expect, it } from "vitest";
import { botReason } from "@/lib/bots";

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

  it("stops link previews, crawlers and scripts", () => {
    for (const ua of [
      "TelegramBot (like TwitterBot)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0 Safari/537.36",
      "curl/8.7.1",
      "python-requests/2.32.3",
      "Go-http-client/2.0",
    ]) expect(botReason(person(ua)), ua).toBe("bot-ua");
  });

  it("stops prefetches, HEAD checks, empty agents and requests without Accept-Language", () => {
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
    expect(botReason({ ...person(chrome), purpose: "prefetch;prerender" })).toBe("prefetch");
    expect(botReason({ ...person(chrome), method: "HEAD" })).toBe("head");
    expect(botReason(person(""))).toBe("no-ua");
    expect(botReason({ ...person(chrome), acceptLanguage: null })).toBe("no-accept-language");
  });
});
