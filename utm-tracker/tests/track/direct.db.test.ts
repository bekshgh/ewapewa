import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("direct registrations (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `dr${Date.now().toString(36)}`;
  const host = `${tag}.tilda.ws`;
  let POST: (req: NextRequest) => Promise<Response>;

  const send = (body: Record<string, string>, ip = "10.0.0.1") =>
    POST(new NextRequest("http://x/api/track/conversion", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    })).then((r) => r.json());

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ POST } = await import("@/app/api/track/conversion/route"));
    const c = await db.campaign.create({ data: { name: `${tag}_f26`, label: `${tag} F'26` } });
    await db.trackingLink.create({ data: { name: tag, slug: `${tag}-tg`, destinationUrl: `https://${host}/landing`, campaignId: c.id, utmCampaign: c.name, utmSource: "telegram" } });
  });

  afterAll(async () => {
    const leads = await db.lead.findMany({ where: { pageUrl: { contains: host } }, select: { id: true } });
    await db.webhookLog.deleteMany({ where: { leadId: { in: leads.map((l) => l.id) } } });
    await db.lead.deleteMany({ where: { pageUrl: { contains: host } } });
    await db.trackingLink.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.campaign.deleteMany({ where: { name: { startsWith: tag } } });
    await db.$disconnect();
  });

  it("records a registration without a tracker click, in the campaign of the page", async () => {
    const r = await send({ sid: `${tag}-a`, pageUrl: `https://${host}/landing`, email: "a@x.kz", name: "A" });
    expect(r.direct).toBe(true);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: r.leadId } });
    expect(lead).toMatchObject({ utmCampaign: `${tag}_f26`, utmSource: "direct", utmMedium: "none", email: "a@x.kz" });

    // the success callback of the same page view merges into the same lead
    const again = await send({ sid: `${tag}-a`, pageUrl: `https://${host}/landing`, email: "a@x.kz", phone: "+77010000000" });
    expect(again).toMatchObject({ leadId: r.leadId, deduped: true });
    expect((await db.lead.findUniqueOrThrow({ where: { id: r.leadId } })).phone).toBe("+77010000000");
  });

  it("keeps UTM from the page URL", async () => {
    const r = await send({ sid: `${tag}-u`, pageUrl: `https://${host}/landing`, email: "u@x.kz", utm_source: "instagram", utm_campaign: "spring" });
    expect(await db.lead.findUniqueOrThrow({ where: { id: r.leadId } })).toMatchObject({ utmSource: "instagram", utmCampaign: "spring" });
  });

  it("ignores other sites, missing contacts, and floods from one IP", async () => {
    expect((await send({ sid: `${tag}-s`, pageUrl: "https://spam.example/x", email: "s@x.kz" })).ignored).toBe("unknown_site");
    expect((await send({ sid: `${tag}-n`, pageUrl: `https://${host}/landing`, name: "No contact" })).ignored).toBe("no_contact");
    const ip = `10.${Date.now() % 250}.${Math.floor(Math.random() * 250)}.9`;
    const results = [];
    for (let i = 0; i < 12; i++) results.push(await send({ sid: `${tag}-f${i}`, pageUrl: `https://${host}/landing`, email: `f${i}@x.kz` }, ip));
    expect(results.filter((x) => x.leadId)).toHaveLength(10);
    expect(results.at(-1)!.ignored).toBe("rate_limited");
  });
});
