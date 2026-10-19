import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, partnerRows, planKit, slugFor, slugPart, suggestPrefix } from "@/lib/linkKit";

describe("suggestPrefix", () => {
  it("takes the initials and leaves the season out", () => {
    expect(suggestPrefix("TopTalents Sprint F'26")).toBe("tts");
    expect(suggestPrefix("Youth Speak Forum 2026")).toBe("ysf");
    expect(suggestPrefix("ICY")).toBe("icy");
  });
});

describe("slugs", () => {
  it("are prefix-source-content with short source names", () => {
    expect(slugFor("tts", { source: "telegram", medium: "message", content: "rassylka" })).toBe("tts-tg-rassylka");
    expect(slugFor("tts", { source: "instagram", medium: "bio", content: "" })).toBe("tts-ig-bio");
    expect(slugFor("tts", { source: "Partner Site", medium: "referral", content: "Инфопартнер 1" })).toBe("tts-partner-site-infopartner-1");
  });
  it("transliterate Cyrillic", () => {
    expect(slugPart("Рассылка Qазақ")).toBe("rassylka-qazak");
  });
});

describe("planKit", () => {
  const existing = [{ slug: "tts-tg-rassylka", utmSource: "telegram", utmMedium: "message", utmContent: "rassylka" }];

  it("skips links the campaign already has, repeats, and suffixes taken slugs", () => {
    const plan = planKit(
      "tts",
      [
        { source: "Telegram", medium: "message", content: "rassylka" }, // exists (case-insensitive)
        { source: "instagram", medium: "bio", content: "tapter" },
        { source: "instagram", medium: "bio", content: "tapter" }, // repeat
        { source: "qr", medium: "offline", content: "poster" }, // slug taken by another link
      ],
      existing,
      ["tts-tg-rassylka", "tts-qr-poster"],
    );
    expect(plan.map((r) => [r.status, r.slug])).toEqual([
      ["exists", "tts-tg-rassylka"],
      ["new", "tts-ig-tapter"],
      ["duplicate", ""],
      ["new", "tts-qr-poster-2"],
    ]);
  });

  it("creates the whole default template on an empty campaign", () => {
    const plan = planKit("tts", DEFAULT_TEMPLATE.rows, [], []);
    expect(plan.every((r) => r.status === "new")).toBe(true);
    expect(new Set(plan.map((r) => r.slug)).size).toBe(DEFAULT_TEMPLATE.rows.length);
    expect(plan.map((r) => r.slug)).toContain("tts-ig-tapter");
    expect(plan.map((r) => r.slug)).toContain("tts-qr-lower-atrium");
  });
});

describe("partnerRows", () => {
  it("continues the numbering", () => {
    const rows = partnerRows([{ source: "referral", medium: "referral", content: "infopartner3" }], 2);
    expect(rows.map((r) => [r.label, r.content])).toEqual([["Info partner 4", "infopartner4"], ["Info partner 5", "infopartner5"]]);
  });
});

describe("planKit on another domain", () => {
  const existing = [{ slug: "bc2-tg-telegram", utmSource: "telegram", utmMedium: "social", utmContent: "telegram", shortDomain: null }];
  const row = { source: "telegram", medium: "social", content: "telegram" };

  it("makes a second set of the same rows, slugs tagged with the domain", async () => {
    const { domainTag } = await import("@/lib/linkKit");
    expect(domainTag("zimran-aiesec.vercel.app")).toBe("zimran");
    expect(domainTag("go.aiesec.kz")).toBe("go");
    const plan = planKit("bc2", [row], existing, ["bc2-tg-telegram"], "zimran-aiesec.vercel.app");
    expect(plan).toEqual([{ ...row, slug: "bc2-tg-telegram-zimran", status: "new" }]);
    // on the main domain the row still exists
    expect(planKit("bc2", [row], existing, ["bc2-tg-telegram"])[0].status).toBe("exists");
  });

  it("does not repeat a set already made on that domain", () => {
    const both = [...existing, { slug: "bc2-tg-telegram-zimran", utmSource: "telegram", utmMedium: "social", utmContent: "telegram", shortDomain: "zimran-aiesec.vercel.app" }];
    expect(planKit("bc2", [row], both, [], "zimran-aiesec.vercel.app")[0]).toMatchObject({ slug: "bc2-tg-telegram-zimran", status: "exists" });
  });
});

describe("short link domains", () => {
  it("build the URL on the link's domain, the main one when none", async () => {
    const { shortUrl, storedDomain, hostOf } = await import("@/lib/linkDomains");
    expect(shortUrl("https://aieseckz.vercel.app/", "bc2-qr", null)).toBe("https://aieseckz.vercel.app/r/bc2-qr");
    expect(shortUrl("https://aieseckz.vercel.app", "bc2-qr", "zimran-aiesec.vercel.app")).toBe("https://zimran-aiesec.vercel.app/r/bc2-qr");
    expect(storedDomain("https://aieseckz.vercel.app", "aieseckz.vercel.app")).toBeNull();
    expect(storedDomain("https://aieseckz.vercel.app", "https://Zimran-AIESEC.vercel.app/")).toBe("zimran-aiesec.vercel.app");
    expect(hostOf("https://go.aiesec.kz/r/x")).toBe("go.aiesec.kz");
  });
});
