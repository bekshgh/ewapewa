import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("breakdowns count every lead (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `b${Date.now().toString(36)}`;
  let analytics: typeof import("@/lib/analytics");

  const lead = (key: string, data: Record<string, unknown>) =>
    db.lead.create({ data: { submittedAt: new Date(), sourcePayload: {}, dedupeKey: `${tag}:${key}`, ...data } });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    analytics = await import("@/lib/analytics");
    const link = await db.trackingLink.create({
      data: { name: tag, slug: `${tag}-tg`, destinationUrl: "https://x.example/", utmSource: `${tag}src`, utmCampaign: `${tag}camp` },
    });
    await lead("linked", { trackingLinkId: link.id }); // UTM only on the link
    await lead("own", { utmSource: `${tag}src`, utmCampaign: `${tag}camp` }); // no link (imported)
    await lead("other", { utmSource: `${tag}other`, trackingLinkId: link.id }); // own UTM wins
  });

  afterAll(async () => {
    await db.lead.deleteMany({ where: { dedupeKey: { startsWith: `${tag}:` } } });
    await db.trackingLink.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.$disconnect();
  });

  it("uses the lead's own UTM, falling back to its link's", async () => {
    const bySource = await analytics.getBySource("all");
    expect(bySource.find((r) => r.key === `${tag}src`)?.leads).toBe(2);
    expect(bySource.find((r) => r.key === `${tag}other`)?.leads).toBe(1);
    const byCampaign = await analytics.getByCampaign("all");
    expect(byCampaign.find((r) => r.key === `${tag}camp`)?.leads).toBe(3);
  });
});
