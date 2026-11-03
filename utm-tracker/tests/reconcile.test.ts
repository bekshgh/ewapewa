import { describe, expect, it } from "vitest";
import { detectFileColumns, pickReconcileSheet, reconcile, siteTag, type SiteLead } from "@/lib/reconcile";

const lead = (over: Partial<SiteLead>): SiteLead => ({
  email: null, phone: null, at: "2026-10-20 12:00", source: null, medium: null, campaign: null, content: null, kind: "link", ...over,
});

// a Zimran-style export: «Метка» is source-medium-content
const HEAD = ["Состояние", "Имя", "Почта", "Метка", "Phone number", "Создано"];
const row = (email: string, tag: string, at: string, phone = "") => ({ Состояние: "заявка подана", Имя: "x", Почта: email, Метка: tag, "Phone number": phone, Создано: at });

describe("registration check", () => {
  it("finds the export's columns", () => {
    expect(detectFileColumns(HEAD)).toEqual({ email: "Почта", phone: "Phone number", createdAt: "Создано", tag: "Метка" });
    expect(pickReconcileSheet([{ name: "Stats", headers: ["Канал", "Всего"], objects: [{}] }, { name: "Кандидаты", headers: HEAD, objects: [{}] }])).toBe("Кандидаты");
  });

  it("glues the site's UTM like the export's tag; direct has none", () => {
    expect(siteTag(lead({ source: "instagram", medium: "bio", campaign: "businesscup_f26", content: "tapter" }))).toBe("instagram-bio-tapter");
    expect(siteTag(lead({ source: "direct", medium: "none", campaign: "businesscup_f26", kind: "direct" }))).toBe("");
  });

  it("matches people, sorts out tags and days", () => {
    const objects = [
      row("A@x.kz ", "instagram-bio-tapter", "2026-10-20 10:00"),
      row("a@x.kz", "", "2026-10-21 10:00"), // a repeat send
      row("b@x.kz", "", "2026-10-20 11:00"), // no tag in both
      row("c@x.kz", "telegram-message-rassylka", "2026-10-21 09:00"), // direct on the site
      row("d@x.kz", "", "2026-10-21 09:30"), // a channel only on the site
      row("e@x.kz", "qr-offline-poster", "2026-10-21 12:00"), // the site missed it
      row("", "", "2026-10-21 13:00", "+7 701 111 22 33"), // by phone
      row("", "", ""), // an empty line
    ];
    const r = reconcile(objects, detectFileColumns(HEAD), [
      lead({ email: "a@x.kz", source: "instagram", medium: "bio", campaign: "businesscup_f26", content: "tapter" }),
      lead({ email: "b@x.kz", source: "direct", medium: "none", campaign: "businesscup_f26", kind: "direct" }),
      lead({ email: "c@x.kz", source: "direct", medium: "none", kind: "direct" }),
      lead({ email: "d@x.kz", source: "telegram", medium: "social", content: "angsagan" }),
      lead({ email: "z@x.kz", source: "email", medium: "email", content: "mailing_reminder", at: "2026-10-21 08:00" }), // only on the site
      lead({ email: "late@x.kz", at: "2026-10-22 18:00" }), // after the export
      lead({ phone: "87011112233", kind: "direct", source: "direct" }),
    ]);
    expect(r.file).toMatchObject({ rows: 7, people: 6, repeats: 1, from: "2026-10-20 10:00", to: "2026-10-21 13:00" });
    expect(r.matched).toBe(5);
    expect(r.onlyFile.map((p) => p.contact)).toEqual(["e@x.kz"]);
    expect(r.onlySite.map((p) => p.contact)).toEqual(["z@x.kz"]);
    expect(r.site.outside).toBe(1);
    expect(r.tags).toEqual({ same: 1, bothEmpty: 2, fileOnly: 1, siteOnly: 1, different: 0 });
    expect(r.pairs).toEqual([
      { fileTag: "telegram-message-rassylka", siteTag: "", n: 1 },
      { fileTag: "", siteTag: "telegram-social-angsagan", n: 1 },
    ].sort((a, b) => b.n - a.n));
    expect(r.onlyFileByTag).toEqual([{ tag: "qr-offline-poster", n: 1 }]);
    expect(r.byDay).toEqual([
      { day: "2026-10-20", file: 2, site: 5, matched: 2 },
      { day: "2026-10-21", file: 4, site: 1, matched: 3 },
    ]);
  });
});
