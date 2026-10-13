import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { Actor } from "@/lib/permissions";

// auth.ts reads the session cookie through next/headers; these tests pass the actor directly.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("project manager rights (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `au${Date.now().toString(36)}`;
  let auth: typeof import("@/lib/auth");
  const ids: Record<string, string> = {};
  const pm = (keys: string[]): Actor => ({
    id: "pm", owner: false, email: "pm@x.kz", name: "PM", position: null, role: "manager", status: "active", projectKeys: keys,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    auth = await import("@/lib/auth");
    ids.main = (await db.campaign.create({ data: { name: `${tag}_f26`, label: `${tag} F'26` } })).id;
    ids.ogx = (await db.campaign.create({ data: { name: `${tag}_ewa2ogx`, label: `${tag} EwA2oGX` } })).id;
    ids.other = (await db.campaign.create({ data: { name: `${tag}x_s26`, label: `${tag}x S'26` } })).id;
  });

  afterAll(async () => {
    await db.campaign.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await db.$disconnect();
  });

  it("edits every campaign of their folder and nothing else", async () => {
    const me = pm([`${tag}-f26`]);
    expect(await auth.canEditCampaign(me, ids.main)).toBe(true);
    expect(await auth.canEditCampaign(me, ids.ogx)).toBe(true);
    expect(await auth.canEditCampaign(me, ids.other)).toBe(false);
    expect(await auth.canEditCampaign(pm([]), ids.main)).toBe(false);
  });

  it("creates campaigns only inside their folder", async () => {
    const me = pm([`${tag}-f26`]);
    expect(await auth.canCreateCampaign(me, { name: `${tag}_ewa2mxp`, label: `${tag} EwA2MXP` })).toBe(true);
    expect(await auth.canCreateCampaign(me, { name: "someone_else_s26", label: "Someone Else S'26" })).toBe(false);
  });

  it("links follow their campaign, by id or by utm_campaign", async () => {
    const me = pm([`${tag}-f26`]);
    expect(await auth.canEditLink(me, { campaignId: ids.ogx })).toBe(true);
    expect(await auth.canEditLink(me, { utmCampaign: `${tag}_f26` })).toBe(true);
    expect(await auth.canEditLink(me, { utmCampaign: `${tag}x_s26` })).toBe(false);
    expect(await auth.canEditLink(me, {})).toBe(false);
  });
});
