import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("project folder stats (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `pf${Date.now().toString(36)}`;
  let stats: typeof import("@/lib/projectStats");
  const ids: string[] = [];

  const lead = (key: string, data: Record<string, unknown>) =>
    db.lead.create({ data: { submittedAt: new Date(), sourcePayload: {}, dedupeKey: `${tag}:${key}`, ...data } });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    stats = await import("@/lib/projectStats");
    const project = await db.campaign.create({ data: { name: `${tag}_f26`, label: `${tag} F'26` } });
    const ogx = await db.campaign.create({ data: { name: `${tag}_ewa2ogx`, label: `${tag} EwA2oGX` } });
    ids.push(project.id, ogx.id);
    const link = await db.trackingLink.create({
      data: { name: tag, slug: `${tag}-ogx`, destinationUrl: "https://x.example/", campaignId: ogx.id, utmCampaign: ogx.name, utmSource: "telegram", utmContent: "tapter" },
    });
    await db.clickEvent.createMany({
      // three devices; the fourth click is the third device again
      data: [1, 2, 3, 4].map((i) => ({ trackingLinkId: link.id, clickId: `${tag}c${i}`, ipHash: `${tag}ip${Math.min(i, 3)}`, userAgent: "Safari" })),
    });
    // Four project registrations, two of them later apply to oGX.
    for (const i of [1, 2, 3, 4]) {
      await lead(`p${i}`, { utmCampaign: project.name, utmSource: "telegram", utmContent: "tapter", email: `u${i}@${tag}.kz` });
    }
    await lead("o1", { trackingLinkId: link.id, email: `U1@${tag}.kz` }); // campaign from the link
    await lead("o2", { utmCampaign: ogx.name, utmSource: "telegram", utmContent: "tapter", phone: "+7 701 000 00 02", email: `u2@${tag}.kz` });
    await lead("o3", { utmCampaign: ogx.name, utmSource: "instagram", email: `new@${tag}.kz` });
  });

  afterAll(async () => {
    await db.lead.deleteMany({ where: { dedupeKey: { startsWith: `${tag}:` } } });
    await db.clickEvent.deleteMany({ where: { clickId: { startsWith: tag } } });
    await db.trackingLink.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.campaign.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("counts project and programme registrations and the conversion between them", async () => {
    const s = (await stats.projectStats(`${tag}-f26`))!;
    expect(s.group.title).toBe(`${tag} F'26`);
    expect(s.totals.projectRegs).toBe(4);
    const ogx = s.campaigns.find((c) => c.role.title === "EwA2oGX")!;
    expect(ogx).toMatchObject({ leads: 3, clicks: 4, uniqueClicks: 3, ofProject: 75, fromProject: 2 });
    expect(s.campaigns[0].role.kind).toBe("project");

    const tapter = s.byContent.find((r) => r.key === "tapter")!;
    expect(tapter.uniqueClicks).toBe(3);
    expect(tapter.leads).toEqual({ [ids[0]]: 4, [ids[1]]: 2 });
  });
});
