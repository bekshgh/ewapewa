import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("POST /api/collect (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `co${Date.now().toString(36)}`;
  let route: typeof import("@/app/api/collect/route");
  const ORIGIN = "https://aiesecinkz.tilda.ws";
  const batch = (n = 1) => ({
    v: 1, sid: `${tag}s1`, vid: `${tag}v1`, form: `${tag}-form`, project: "p",
    ctx: { utm_source: "telegram", lang: "ru", fields: [{ k: "name", kind: "text" }] },
    events: Array.from({ length: n }, (_, i) => ({ id: `${tag}s1.${i + 1}`, t: "page_view", ts: Date.now(), o: 0 })),
  });
  const post = (body: string, origin: string | null = ORIGIN) =>
    route.POST(new NextRequest("http://x/api/collect", {
      method: "POST", body,
      headers: { "content-type": "text/plain", "x-forwarded-for": "10.1.2.3", "x-vercel-ip-country": "KZ", ...(origin ? { origin } : {}) },
    }));

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    route = await import("@/app/api/collect/route");
  });
  afterAll(async () => {
    await db.analyticsForm.deleteMany({ where: { id: `${tag}-form` } });
    await db.$disconnect();
  });

  it("accepts a beacon from the landing, stores it once, keeps no raw IP", async () => {
    const r = await post(JSON.stringify(batch()));
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await r.json()).toMatchObject({ ok: true, stored: 1 });
    expect(await (await post(JSON.stringify(batch()))).json()).toMatchObject({ stored: 0, duplicates: 1 });
    const s = await db.analyticsSession.findUniqueOrThrow({ where: { id: `${tag}s1` } });
    expect(s).toMatchObject({ country: "KZ", utmSource: "telegram" });
    expect(s.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(s)).not.toContain("10.1.2.3");
  });

  it("answers the preflight for allowed origins only", async () => {
    const ok = await route.OPTIONS(new NextRequest("http://x/api/collect", { method: "OPTIONS", headers: { origin: ORIGIN } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const no = await route.OPTIONS(new NextRequest("http://x/api/collect", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(no.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects other sites, junk, oversize and foreign event ids", async () => {
    expect((await post(JSON.stringify(batch()), "https://evil.example")).status).toBe(403);
    expect((await post(JSON.stringify(batch()), null)).status).toBe(403);
    expect((await post("not json")).status).toBe(400);
    expect((await post(JSON.stringify({ ...batch(), events: [] }))).status).toBe(422);
    expect((await post(JSON.stringify(batch(51)))).status).toBe(422);
    expect((await post("x".repeat(70 * 1024))).status).toBe(413);
    const foreign = batch(); foreign.events[0].id = "someoneelse.1";
    expect((await post(JSON.stringify(foreign))).status).toBe(422);
  });
});
