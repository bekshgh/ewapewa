import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("sign-in / sign-up rate limits (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const ip = `10.77.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  let login: (req: NextRequest) => Promise<Response>;
  let register: (req: NextRequest) => Promise<Response>;
  const post = (fn: (r: NextRequest) => Promise<Response>, path: string, body: unknown) =>
    fn(new NextRequest(`http://x${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": ip } }));

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ POST: login } = await import("@/app/api/auth/login/route"));
    ({ POST: register } = await import("@/app/api/auth/register/route"));
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { startsWith: "limit-test-" } } });
    await db.$disconnect();
  });

  it("blocks sign-in after 10 wrong passwords from one visitor", async () => {
    for (let i = 0; i < 10; i++) expect((await post(login, "/api/auth/login", { email: "nobody@example.test", password: "wrong" })).status).toBe(401);
    const r = await post(login, "/api/auth/login", { email: "nobody@example.test", password: "wrong" });
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/Too many attempts/);
  });

  it("allows 5 sign-ups an hour from one visitor", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await post(register, "/api/auth/register", { name: "Limit Test", email: `limit-test-${Date.now()}-${i}@example.test`, password: "password123" });
      expect(r.status).toBe(201);
    }
    expect((await post(register, "/api/auth/register", { name: "Limit Test", email: `limit-test-${Date.now()}-x@example.test`, password: "password123" })).status).toBe(429);
  });
});
