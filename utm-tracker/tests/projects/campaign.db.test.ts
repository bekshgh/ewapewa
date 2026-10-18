import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensureProjectCampaign } from "@/lib/projects/campaign";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("a new project's campaign (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `pc${Date.now().toString(36)}`;
  const name = `${tag} Cup F'26`;
  afterAll(async () => {
    await db.campaign.deleteMany({ where: { name: { startsWith: tag } } });
    await db.$disconnect();
  });

  it("is created with the project's name, its utm value and season, then reused", async () => {
    const first = await ensureProjectCampaign(db, { name, typeName: "Hackathon" });
    expect(first.created).toBe(true);
    const c = await db.campaign.findUniqueOrThrow({ where: { id: first.id } });
    expect(c).toMatchObject({ label: name, name: `${tag}_cup_f26`, season: "fall 2026", type: "Hackathon", status: "active" });
    const again = await ensureProjectCampaign(db, { name: name.toUpperCase() });
    expect(again).toEqual({ id: first.id, created: false });
  });
});
