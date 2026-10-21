import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("unique clicks (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `uq${Date.now().toString(36)}`;
  let linkId = "";
  let unique: typeof import("@/lib/analytics").uniqueClicksByLink;
  const click = (n: number, ipHash: string, userAgent: string, daysAgo = 0) =>
    db.clickEvent.create({ data: { trackingLinkId: linkId, clickId: `${tag}-${n}`, ipHash, userAgent, timestamp: new Date(Date.now() - daysAgo * 86_400_000) } });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ uniqueClicksByLink: unique } = await import("@/lib/analytics"));
    linkId = (await db.trackingLink.create({ data: { name: tag, slug: tag, destinationUrl: "https://example.test/" } })).id;
    await click(1, "campus-wifi", "iPhone Safari");
    await click(2, "campus-wifi", "Android Chrome"); // someone else on the same Wi-Fi
    await click(3, "campus-wifi", "iPhone Safari"); // the first person again
    await click(4, "home", "iPhone Safari", 10); // ten days ago
  });
  afterAll(async () => {
    await db.clickEvent.deleteMany({ where: { trackingLinkId: linkId } });
    await db.trackingLink.delete({ where: { id: linkId } });
    await db.$disconnect();
  });

  it("counts devices, not IPs: two phones on one Wi-Fi are two people", async () => {
    expect((await unique(null, [linkId])).get(linkId)).toBe(3);
  });

  it("counts within the period", async () => {
    expect((await unique(new Date(Date.now() - 7 * 86_400_000), [linkId])).get(linkId)).toBe(2);
  });
});
