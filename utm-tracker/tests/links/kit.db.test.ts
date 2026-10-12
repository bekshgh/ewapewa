import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("createKit (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `k${Date.now().toString(36)}`;
  let kit: typeof import("@/lib/linkKitServer");
  let a = "";
  let b = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    kit = await import("@/lib/linkKitServer");
    a = (await db.campaign.create({ data: { name: `${tag}_a`, label: "Kit Test A" } })).id;
    b = (await db.campaign.create({ data: { name: `${tag}_b`, label: "Kit Test B", slugPrefix: `${tag}b` } })).id;
  });

  afterAll(async () => {
    await db.trackingLink.deleteMany({ where: { campaignId: { in: [a, b] } } });
    await db.campaign.deleteMany({ where: { id: { in: [a, b] } } });
    await db.$disconnect();
  });

  const input = (prefix: string) => ({
    slugPrefix: prefix,
    destinationUrl: "https://landing.example/tts",
    rows: [
      { source: "telegram", medium: "message", content: "rassylka" },
      { source: "instagram", medium: "bio", content: "tapter", destinationUrl: "https://other.example/" },
    ],
  });

  it("saves the project code, creates the links, and adds nothing on a rerun", async () => {
    const first = await kit.createKit(a, kit.kitSchema.parse(input(`${tag}a`)));
    expect(first.created).toBe(2);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: a } })).slugPrefix).toBe(`${tag}a`);

    const links = await db.trackingLink.findMany({ where: { campaignId: a }, orderBy: { slug: "asc" } });
    expect(links.map((l) => l.slug)).toEqual([`${tag}a-ig-tapter`, `${tag}a-tg-rassylka`]);
    expect(links.every((l) => l.utmCampaign === `${tag}_a`)).toBe(true);
    expect(links.find((l) => l.utmSource === "instagram")?.destinationUrl).toBe("https://other.example/");

    const again = await kit.createKit(a, kit.kitSchema.parse(input(`${tag}a`)));
    expect(again.created).toBe(0);
    expect(again.rows.every((r) => r.status === "exists")).toBe(true);
  });

  it("refuses a project code another campaign uses", async () => {
    await expect(kit.createKit(a, kit.kitSchema.parse(input(`${tag}b`)))).rejects.toThrow(/already used/);
  });

  it("reads another campaign's structure", async () => {
    const rows = await kit.campaignStructure(a);
    expect(rows).toEqual([
      { source: "telegram", medium: "message", content: "rassylka" },
      { source: "instagram", medium: "bio", content: "tapter" },
    ]);
  });
});
