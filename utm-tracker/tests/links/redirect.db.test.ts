import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

describe.skipIf(!url)("short link clicks (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `rd${Date.now().toString(36)}`;
  const slug = `${tag}-tg`;
  let GET: typeof import("@/app/r/[slug]/route").GET;
  let linkId = "";

  const open = (headers: Record<string, string>, ip = "10.1.1.1") =>
    GET(new NextRequest(`http://x/r/${slug}`, { headers: { "x-forwarded-for": ip, ...headers } }), { params: Promise.resolve({ slug }) });
  const clicks = () => db.clickEvent.count({ where: { trackingLinkId: linkId } });
  const clickIdOf = (r: Response) => new URL(r.headers.get("location")!).searchParams.get("click_id");

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ GET } = await import("@/app/r/[slug]/route"));
    const l = await db.trackingLink.create({ data: { name: tag, slug, destinationUrl: `https://${tag}.example/apply`, utmSource: "telegram" } });
    linkId = l.id;
  });
  afterAll(async () => {
    await db.clickEvent.deleteMany({ where: { trackingLinkId: linkId } });
    await db.trackingLink.deleteMany({ where: { id: linkId } });
    await db.$disconnect();
  });

  it("redirects a Telegram link preview with the UTM tags, without counting a click", async () => {
    const r = await open({ "user-agent": "TelegramBot (like TwitterBot)" });
    expect(r.status).toBe(302);
    const to = new URL(r.headers.get("location")!);
    expect(to.searchParams.get("utm_source")).toBe("telegram");
    expect(to.searchParams.get("click_id")).toBeNull();
    expect(await clicks()).toBe(0);
  });

  it("counts a QR scan made by a scanner app, once even when the browser opens it next", async () => {
    const qr = await db.trackingLink.create({ data: { name: `${tag} qr`, slug: `${tag}-qr-banner`, destinationUrl: `https://${tag}.example/apply`, utmSource: "qr", utmMedium: "offline" } });
    const scan = (headers: Record<string, string>) =>
      GET(new NextRequest(`http://x/r/${qr.slug}`, { headers: { "x-forwarded-for": "10.3.3.3", ...headers } }), { params: Promise.resolve({ slug: qr.slug }) });
    await scan({ "user-agent": "Dalvik/2.1.0 (Linux; U; Android 13; M2101K6G Build/TKQ1)" });
    await scan({ "user-agent": CHROME, "accept-language": "ru" });
    expect(await db.clickEvent.count({ where: { trackingLinkId: qr.id } })).toBe(1);
    await scan({ "user-agent": "TelegramBot (like TwitterBot)" });
    expect(await db.clickEvent.count({ where: { trackingLinkId: qr.id } })).toBe(1);
    await db.clickEvent.deleteMany({ where: { trackingLinkId: qr.id } });
    await db.trackingLink.delete({ where: { id: qr.id } });
  });

  it("counts a person once, even when they tap again within seconds", async () => {
    const person = { "user-agent": CHROME, "accept-language": "ru-RU,ru;q=0.9" };
    const first = await open(person);
    const again = await open(person);
    expect(await clicks()).toBe(1);
    expect(clickIdOf(first)).toBeTruthy();
    expect(clickIdOf(again)).toBe(clickIdOf(first)); // a lead from either tab still matches the click
    await open(person, "10.2.2.2"); // someone else
    expect(await clicks()).toBe(2);
  });
});
