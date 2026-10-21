import { describe, expect, it } from "vitest";
import { preferLinkTags } from "@/lib/attribution";

const qrCoffee = { utmSource: "qr", utmMedium: "offline", utmCampaign: "bc2.0_f26", utmContent: "coffee", utmTerm: null };
const instagram = { utmSource: "instagram", utmMedium: "social", utmCampaign: "bc2.0_f26", utmContent: null, utmTerm: null };

describe("a lead with a known click takes the link's tags", () => {
  it("ignores stale or mixed tags from the page", () => {
    // yesterday's QR left utm_content=coffee in a cookie; today's click is the Instagram link
    const page = { utmSource: "instagram", utmMedium: "social", utmCampaign: "bc2.0_f26", utmContent: "coffee" };
    expect(preferLinkTags(instagram, page)).toEqual({ utmSource: "instagram", utmMedium: "social", utmCampaign: "bc2.0_f26", utmContent: undefined, utmTerm: undefined });
  });

  it("keeps the link's tags even when the page says something else", () => {
    const page = { utmSource: "coffee", utmCampaign: "bc2.0_f26" };
    expect(preferLinkTags(qrCoffee, page)).toMatchObject({ utmSource: "qr", utmMedium: "offline", utmContent: "coffee" });
  });

  it("lets the page fill a link without tags, and keeps other fields", () => {
    const bare = { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null };
    const page = { utmSource: "telegram", utmContent: "post", name: "A" };
    expect(preferLinkTags(bare, page)).toEqual(page);
    expect(preferLinkTags(instagram, page)).toMatchObject({ name: "A", utmSource: "instagram" });
  });
});
