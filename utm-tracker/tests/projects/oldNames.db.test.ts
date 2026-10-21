import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("old names (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `on${Date.now().toString(36)}`;
  let oldNames: typeof import("@/lib/oldNames").oldNames;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ oldNames } = await import("@/lib/oldNames"));
    const type = await db.projectType.upsert({ where: { key: `${tag}t` }, create: { key: `${tag}t`, name: `${tag} type` }, update: {} });
    await db.project.create({ data: { slug: `${tag}-p1`, name: `${tag} Forum`, typeId: type.id, startDate: new Date("2026-03-10") } });
    await db.project.create({ data: { slug: `${tag}-p2`, name: `${tag} Ok F'26`, typeId: type.id } }); // already fine
    await db.campaign.create({ data: { name: `${tag}_s26`, label: `${tag} Cup` } });
    await db.campaign.create({ data: { name: `${tag}x`, label: `${tag} Fest`, season: "fall 2025" } });
    await db.campaign.create({ data: { name: `${tag}y`, label: `${tag} Week Spring 2027` } });
    await db.campaign.create({ data: { name: `${tag}z`, label: `${tag} Mystery` } });
  });
  afterAll(async () => {
    await db.project.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.projectType.deleteMany({ where: { key: `${tag}t` } });
    await db.campaign.deleteMany({ where: { name: { startsWith: tag } } });
    await db.$disconnect();
  });

  it("lists names without a term, with a suggestion where the term can be worked out", async () => {
    const mine = Object.fromEntries((await oldNames()).filter((i) => i.name.startsWith(tag)).map((i) => [i.name, i.suggested]));
    expect(mine).toEqual({
      [`${tag} Forum`]: `${tag} Forum S'26`, // project: from its start date
      [`${tag} Cup`]: `${tag} Cup S'26`, // campaign: from its utm value
      [`${tag} Fest`]: `${tag} Fest F'25`, // from its season
      [`${tag} Week Spring 2027`]: `${tag} Week S'27`, // the term was there, spelled out
      [`${tag} Mystery`]: null, // nothing to go on
    });
  });
});
