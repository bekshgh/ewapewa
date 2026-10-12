import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { ParsedRegistrations } from "@/lib/registrationImport";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("importRegistrations (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `t${Date.now()}`;
  const camp = `regimport_${tag}`;
  let importRegistrations: typeof import("@/lib/registrationImport").importRegistrations;

  const parsed: ParsedRegistrations = {
    sheet: "Заявки",
    skipped: 0,
    rows: [
      // exact: click recorded, page has no UTM → UTM taken from the link
      { row: 2, submittedAt: new Date("2026-08-30T05:00:00Z"), email: `a_${tag}@x.kz`, clickId: `clk_${tag}_1`, pageUrl: "https://l.tilda.ws/tts" },
      // estimated: click unknown, UTM matches the link
      { row: 3, submittedAt: new Date("2026-08-30T06:00:00Z"), email: `b_${tag}@x.kz`, clickId: `clk_${tag}_missing`, utmCampaign: camp, utmSource: "telegram", utmContent: "rassylka" },
      // unknown: nothing to match
      { row: 4, submittedAt: new Date("2026-08-30T07:00:00Z"), phone: `+7${tag}` },
    ],
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url; // lib/db reads it
    ({ importRegistrations } = await import("@/lib/registrationImport"));
    const link = await db.trackingLink.create({
      data: { name: "TTS", slug: `s_${tag}`, destinationUrl: "https://l.tilda.ws/tts", utmSource: "telegram", utmCampaign: camp, utmContent: "rassylka" },
    });
    await db.clickEvent.create({ data: { trackingLinkId: link.id, clickId: `clk_${tag}_1` } });
  });

  afterAll(async () => {
    await db.lead.deleteMany({ where: { OR: [{ utmCampaign: camp }, { phone: `+7${tag}` }, { email: { endsWith: `${tag}@x.kz` } }] } });
    await db.clickEvent.deleteMany({ where: { clickId: { startsWith: `clk_${tag}` } } });
    await db.trackingLink.deleteMany({ where: { slug: `s_${tag}` } });
    await db.$disconnect();
  });

  it("checks without writing, then imports exact / estimated / unknown leads once", async () => {
    const check = await importRegistrations(parsed, "check");
    expect(check).toMatchObject({ created: 3, exact: 1, estimated: 1, unknown: 1, clickNotFound: 1, alreadyImported: 0 });
    expect(await db.lead.count({ where: { utmCampaign: camp } })).toBe(0);

    const first = await importRegistrations(parsed, "import");
    expect(first.created).toBe(3);
    // the campaign page counts leads by utm_campaign: exact + estimated
    expect(await db.lead.count({ where: { utmCampaign: camp } })).toBe(2);
    const exact = await db.lead.findFirstOrThrow({ where: { clickId: `clk_${tag}_1` } });
    expect(exact).toMatchObject({ attributionStatus: "exact", utmCampaign: camp, utmSource: "telegram" });
    expect(exact.clickEventId).not.toBeNull();
    expect(exact.submittedAt.toISOString()).toBe("2026-08-30T05:00:00.000Z");

    const again = await importRegistrations(parsed, "import");
    expect(again).toMatchObject({ created: 0, alreadyImported: 3 });
    expect(await db.lead.count({ where: { utmCampaign: camp } })).toBe(2);
  });
});
