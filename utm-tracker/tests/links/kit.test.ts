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
  });
});

describe("partnerRows", () => {
  it("continues the numbering", () => {
    const rows = partnerRows([{ source: "referral", medium: "referral", content: "infopartner3" }], 2);
    expect(rows.map((r) => r.content)).toEqual(["infopartner4", "infopartner5"]);
  });
});
