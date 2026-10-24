import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { deviceOf, signupInfo } from "@/lib/signupInfo";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const WIN_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

describe("sign-up context", () => {
  it("reads city, country, device, browser, language and the referring site; keeps no IP", () => {
    const req = new NextRequest("https://aieseckz.vercel.app/api/auth/register", {
      method: "POST",
      headers: {
        host: "aieseckz.vercel.app", "user-agent": IPHONE, "accept-language": "ru-RU,ru;q=0.9",
        "x-vercel-ip-city": "Almaty", "x-vercel-ip-country": "KZ", "x-forwarded-for": "1.2.3.4",
      },
    });
    const info = signupInfo(req, "https://t.me/aieseckz");
    expect(info).toEqual({ city: "Almaty", country: "KZ", device: "mobile", os: "iOS", browser: "Safari", lang: "ru-RU", from: "t.me" });
    expect(JSON.stringify(info)).not.toContain("1.2.3.4");
  });

  it("drops our own site as a referrer and tells devices apart", () => {
    const req = new NextRequest("https://aieseckz.vercel.app/api/auth/register", { method: "POST", headers: { host: "aieseckz.vercel.app", "user-agent": WIN_CHROME } });
    expect(signupInfo(req, "https://aieseckz.vercel.app/login")).toEqual({ device: "desktop", os: "Windows", browser: "Chrome" });
    expect(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
  });
});

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("declined sign-ups (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const email = `signup-test-${Date.now()}@example.test`;
  let register: (req: NextRequest) => Promise<Response>;
  let login: (req: NextRequest) => Promise<Response>;
  const post = (fn: (r: NextRequest) => Promise<Response>, path: string, body: unknown) =>
    fn(new NextRequest(`http://x${path}`, {
      method: "POST", body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-forwarded-for": `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, "x-vercel-ip-city": "Astana", "user-agent": WIN_CHROME },
    }));

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ POST: register } = await import("@/app/api/auth/register/route"));
    ({ POST: login } = await import("@/app/api/auth/login/route"));
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  });

  it("asks who the person is and stores where they signed up from", async () => {
    expect((await post(register, "/api/auth/register", { name: "Signup Test", email, password: "password123" })).status).toBe(422);
    expect((await post(register, "/api/auth/register", { name: "Signup Test", email, password: "password123", about: "OGX, project manager" })).status).toBe(201);
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    expect(u).toMatchObject({ status: "pending", about: "OGX, project manager", signup: { city: "Astana", device: "desktop", os: "Windows" } });
  });

  it("keeps a declined account: no sign-in, and a new sign-up puts it back on the waiting list", async () => {
    const decidedAt = new Date("2026-10-20T10:00:00Z");
    await db.user.update({ where: { email }, data: { status: "declined", decidedAt, decidedBy: "Admin" } });
    const r = await post(login, "/api/auth/login", { email, password: "password123" });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/declined/);

    expect((await post(register, "/api/auth/register", { name: "Signup Again", email, password: "password456", about: "OGX again" })).status).toBe(201);
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    expect(u).toMatchObject({ status: "pending", name: "Signup Again", about: "OGX again", decidedBy: "Admin" });
    expect(u.decidedAt?.toISOString()).toBe(decidedAt.toISOString());
  });
});
