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
  let WEBHOOK: (req: NextRequest) => Promise<Response>;
  let LIMIT = 0;

  const send = (body: Record<string, string>, ip = "10.0.0.1") =>
    POST(new NextRequest("http://x/api/track/conversion", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    })).then((r) => r.json());

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ POST } = await import("@/app/api/track/conversion/route"));
    ({ POST: WEBHOOK } = await import("@/app/api/webhooks/tilda-lead/route"));
    ({ DIRECT_PER_IP_PER_HOUR: LIMIT } = await import("@/lib/directLeads"));
    const c = await db.campaign.create({ data: { name: `${tag}_f26`, label: `${tag} F'26` } });
    await db.trackingLink.create({ data: { name: tag, slug: `${tag}-tg`, destinationUrl: `https://${host}/landing`, campaignId: c.id, utmCampaign: c.name, utmSource: "telegram" } });
    // another project's landing on the same site, with a click a week old
    const other = await db.campaign.create({ data: { name: `${tag}_other_f26`, label: `${tag} other F'26` } });
    const link = await db.trackingLink.create({ data: { name: `${tag}-o`, slug: `${tag}-other`, destinationUrl: `https://${host}/other`, campaignId: other.id, utmCampaign: other.name, utmSource: "instagram" } });
    await db.clickEvent.create({ data: { trackingLinkId: link.id, clickId: `${tag}-old-click` } });
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
    for (let i = 0; i < LIMIT + 2; i++) results.push(await send({ sid: `${tag}-f${i}`, pageUrl: `https://${host}/landing`, email: `f${i}@x.kz` }, ip));
    expect(results.filter((x) => x.leadId)).toHaveLength(LIMIT);
    expect(results.at(-1)!.ignored).toBe("rate_limited");
  });

  it("does not credit another project's old click to this project's page", async () => {
    const r = await send({ sid: `${tag}-k`, pageUrl: `https://${host}/landing`, email: "k@x.kz", click_id: `${tag}-old-click`, utm_source: "instagram", utm_campaign: `${tag}_other_f26` });
    expect(r.direct).toBe(true);
    expect(await db.lead.findUniqueOrThrow({ where: { id: r.leadId } })).toMatchObject({ utmCampaign: `${tag}_f26`, utmSource: "direct", clickId: null });
    // on the other project's own page the click still counts
    const own = await send({ sid: `${tag}-k2`, pageUrl: `https://${host}/other`, email: "k2@x.kz", click_id: `${tag}-old-click` });
    expect(await db.lead.findUniqueOrThrow({ where: { id: own.leadId } })).toMatchObject({ utmCampaign: `${tag}_other_f26`, utmSource: "instagram" });
  });

  it("the form's webhook and the page's script make one lead of a direct registration", async () => {
    const r = await send({ sid: `${tag}-w`, pageUrl: `https://${host}/landing`, email: "W@x.kz" }, "10.1.1.1");
    const hook = await WEBHOOK(new NextRequest("http://x/api/webhooks/tilda-lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "w@x.kz", phone: "+77015550000", pageUrl: `https://${host}/landing?step=3`, University: "KBTU" }),
    })).then((x) => x.json());
    expect(hook).toMatchObject({ leadId: r.leadId, deduped: true });
    expect(await db.lead.findUniqueOrThrow({ where: { id: r.leadId } })).toMatchObject({ phone: "+77015550000", utmCampaign: `${tag}_f26` });

    // alone, the webhook files the lead under the page's project as direct
    const solo = await WEBHOOK(new NextRequest("http://x/api/webhooks/tilda-lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "solo@x.kz", pageUrl: `https://${host}/landing` }),
    })).then((x) => x.json());
    expect(await db.lead.findUniqueOrThrow({ where: { id: solo.leadId } })).toMatchObject({ utmCampaign: `${tag}_f26`, utmSource: "direct", utmMedium: "none" });
  });
});
