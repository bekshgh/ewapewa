import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("click quality of one link (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `cq${Date.now().toString(36)}`;
  let linkId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const link = await db.trackingLink.create({ data: { name: tag, slug: tag, destinationUrl: "https://x.test/", utmSource: "website" } });
    linkId = link.id;
    const ig = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram 300.0";
    const at = (h: number) => new Date(Date.UTC(2026, 10, 3, h - 5, 10)); // Almaty = UTC+5
    await db.clickEvent.createMany({
      data: [
        // one busy device at night: 25 clicks
        ...Array.from({ length: 25 }, (_, i) => ({ trackingLinkId: linkId, clickId: `${tag}-a${i}`, ipHash: "ipA", userAgent: ig, os: "iOS", country: "KZ", city: "Almaty", timestamp: at(3) })),
        // five people once each in the afternoon, from Telegram with a referrer
        ...Array.from({ length: 5 }, (_, i) => ({ trackingLinkId: linkId, clickId: `${tag}-b${i}`, ipHash: `ipB${i}`, userAgent: "Mozilla/5.0 Telegram", browser: "Chrome", referrer: "https://t.me/s/channel", timestamp: at(15) })),
      ],
    });
  });

  afterAll(async () => {
    await db.trackingLink.deleteMany({ where: { slug: tag } });
    await db.$disconnect();
  });

  it("splits clicks by hour, app, referrer and repeats", async () => {
    const { clickQuality } = await import("@/lib/clickQuality");
    const q = await clickQuality(linkId);
    expect(q).toMatchObject({ clicks: 30, devices: 6, ips: 6, leads: 0 });
    expect(q.byHour[3]).toBe(25);
    expect(q.byHour[15]).toBe(5);
    expect(q.apps).toEqual([{ key: "Instagram app", n: 25 }, { key: "Telegram app", n: 5 }]);
    expect(q.referrers).toEqual([{ key: "", n: 25 }, { key: "t.me", n: 5 }]);
    expect(q.places[0]).toEqual({ key: "Almaty, KZ", n: 25 });
    expect(q.repeats).toEqual([{ bucket: "1", devices: 5, clicks: 5 }, { bucket: "21–100", devices: 1, clicks: 25 }]);
    expect(q.topDevices[0]).toMatchObject({ clicks: 25, app: "Instagram app", os: "iOS", place: "Almaty, KZ" });
    expect(q.byDay).toEqual([{ key: "2026-11-03", n: 30 }]);
  });
});
