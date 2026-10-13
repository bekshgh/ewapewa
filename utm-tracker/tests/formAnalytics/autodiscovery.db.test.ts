import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL;
// before anything loads the app's Prisma client
if (url) process.env.DATABASE_URL = url;

describe("categoryValue", () => {
  it("keeps Latin and Cyrillic option values, drops text and contacts", async () => {
    const { categoryValue } = await import("@/lib/formAnalytics/ingest");
    expect(categoryValue("city", "select", "Алматы")).toBe("Алматы");
    expect(categoryValue("english", "select", "B2 Upper-Intermediate")).toBe("B2 Upper-Intermediate");
    expect(categoryValue("Name", "select", "Иван")).toBeUndefined();
    expect(categoryValue("q1", "text", "Алматы")).toBeUndefined();
    expect(categoryValue("q1", "select", "a@b.kz")).toBeUndefined();
    expect(categoryValue("q1", "select", "87011234567")).toBeUndefined();
    expect(categoryValue("q1", "select", "   ")).toBeUndefined();
  });
});

/** Forms found by /t.js on any page: project from the page's links, by hand wins, team sites only. */
describe.skipIf(!url)("forms found on any page (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `ad${Date.now().toString(36)}`;
  const host = `${tag}.tilda.ws`;
  let route: typeof import("@/app/api/collect/route");
  let ingest: typeof import("@/lib/formAnalytics/ingest");
  let reset: () => void;
  let campaignId = "";

  const batch = (form: string, sid: string, ctx: Record<string, unknown>) => ({
    v: 1 as const, sid, vid: `${tag}v1`, form,
    ctx: { url: `https://${host}/camp?x=1`, title: "Регистрация", fields: [{ k: "Name", kind: "text" as const, req: true, label: "Ваше имя" }], ...ctx },
    events: [{ id: `${sid}.1`, t: "page_view" as const, ts: Date.now(), o: 0 }],
  });
  const post = (body: unknown, origin: string) =>
    route.POST(new NextRequest("http://x/api/collect", {
      method: "POST", body: JSON.stringify(body),
      headers: { "content-type": "text/plain", "x-forwarded-for": "10.9.9.9", origin },
    }));

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    route = await import("@/app/api/collect/route");
    ingest = await import("@/lib/formAnalytics/ingest");
    reset = (await import("@/lib/formAnalytics/project")).resetProjectCache;
    const c = await db.campaign.create({ data: { name: `${tag} Camp S'27`, label: `${tag} Camp S'27` } });
    campaignId = c.id;
    await db.trackingLink.create({ data: { name: tag, slug: `${tag}-ig`, destinationUrl: `https://${host}/camp`, campaignId: c.id, utmCampaign: c.name } });
    reset();
  });
  afterAll(async () => {
    await db.analyticsForm.deleteMany({ where: { id: { startsWith: tag } } });
    await db.trackingLink.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.campaign.deleteMany({ where: { id: campaignId } });
    await db.$disconnect();
  });

  it("puts the form into the project whose links lead to the page, with its title and labels", async () => {
    const r = await post(batch(`${tag}.tilda.ws.camp:form1`, `${tag}s1`, {}), `https://${host}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe(`https://${host}`);
    const form = await db.analyticsForm.findUniqueOrThrow({ where: { id: `${tag}.tilda.ws.camp:form1` } });
    expect(form.projectSlug).toBe(`${tag}camp-s27`);
    expect(form).toMatchObject({ title: "Регистрация", pageUrl: `https://${host}/camp`, projectSetByHand: false });
    expect((form.fields as { label?: string }[])[0].label).toBe("Ваше имя");
    const s = await db.analyticsSession.findUniqueOrThrow({ where: { id: `${tag}s1` } });
    expect(s.projectSlug).toBe(`${tag}camp-s27`);
  });

  it("falls back to the visitor's utm_campaign when no link leads to the page", async () => {
    await ingest.ingest(
      batch(`${tag}.other:form2`, `${tag}s2`, { url: `https://${host}/elsewhere`, utm_campaign: `${tag} Camp S'27` }),
      { ipHash: null, country: null },
    );
    const form = await db.analyticsForm.findUniqueOrThrow({ where: { id: `${tag}.other:form2` } });
    expect(form.projectSlug).toBe(`${tag}camp-s27`);
  });

  it("leaves a project picked by hand alone", async () => {
    const id = `${tag}.tilda.ws.camp:form1`;
    await db.analyticsForm.update({ where: { id }, data: { projectSlug: "picked", projectSetByHand: true } });
    await ingest.ingest({ ...batch(id, `${tag}s3`, {}), project: "from-page" }, { ipHash: null, country: null });
    expect((await db.analyticsForm.findUniqueOrThrow({ where: { id } })).projectSlug).toBe("picked");
    expect((await db.analyticsSession.findUniqueOrThrow({ where: { id: `${tag}s3` } })).projectSlug).toBe("picked");
  });

  it("refuses sites the team's links don't lead to", async () => {
    const r = await post(batch(`${tag}.evil:form1`, `${tag}s4`, {}), "https://evil.example");
    expect(r.status).toBe(403);
    expect(await db.analyticsForm.findUnique({ where: { id: `${tag}.evil:form1` } })).toBeNull();
  });
});
