import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import type { Actor } from "@/lib/permissions";

// The route reads the signed-in person through guard(); these tests pass the actor directly.
let actor: Actor;
vi.mock("@/lib/auth", () => ({ guard: async () => actor }));

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("attendance forecast from the site's registrations (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const tag = `af${Date.now().toString(36)}`;
  const key = `${tag}-f26`;
  const ids: string[] = [];
  const admin: Actor = { id: "a", owner: false, email: "a@x.kz", name: "A", position: null, role: "admin", status: "active", projectKeys: [] };
  const pm = (keys: string[]): Actor => ({ ...admin, id: "pm", role: "manager", projectKeys: keys });
  let route: typeof import("@/app/api/project-folders/[key]/attendance-forecast/route");
  const get = (q: string) => route.GET(new NextRequest(`http://x/api/project-folders/${key}/attendance-forecast?${q}`), { params: Promise.resolve({ key }) });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    route = await import("@/app/api/project-folders/[key]/attendance-forecast/route");
    const project = await db.campaign.create({ data: { name: `${tag}_f26`, label: `${tag} F'26` } });
    const ogx = await db.campaign.create({ data: { name: `${tag}_ewa2ogx`, label: `${tag} EwA2oGX` } });
    ids.push(project.id, ogx.id);
    // 60 Tilda registrations with the form's answers, 13:00 Almaty time on Nov 1–3
    for (let i = 0; i < 60; i++) {
      await db.lead.create({
        data: {
          utmCampaign: project.name, email: `u${i}@${tag}.kz`, name: `User ${i}`, dedupeKey: `${tag}:t${i}`,
          submittedAt: new Date(Date.UTC(2026, 10, 1 + (i % 3), 8, 0)),
          sourcePayload: { Name: `User ${i}`, formid: "form1", participation_type: i % 2 ? "Already have a team" : "Solo participant", University: i % 3 ? "Nazarbayev University" : "AITU", year_of_study: "2nd year" },
        },
      });
    }
    // one imported from a sheet, one without answers, one for the programme (not a project registration)
    await db.lead.create({ data: { utmCampaign: project.name, email: `imp@${tag}.kz`, dedupeKey: `${tag}:imp`, submittedAt: new Date(Date.UTC(2026, 10, 3, 9)), sourcePayload: { _source: "registration-import", answers: { university: "ENU", segment: "P0 — Core" } } } });
    await db.lead.create({ data: { utmCampaign: project.name, email: `bare@${tag}.kz`, dedupeKey: `${tag}:bare`, submittedAt: new Date(Date.UTC(2026, 10, 2, 19, 30)), sourcePayload: {} } });
    await db.lead.create({ data: { utmCampaign: ogx.name, email: `ogx@${tag}.kz`, dedupeKey: `${tag}:ogx`, submittedAt: new Date(Date.UTC(2026, 10, 3)), sourcePayload: {} } });
  });

  afterAll(async () => {
    await db.lead.deleteMany({ where: { dedupeKey: { startsWith: `${tag}:` } } });
    await db.appSetting.deleteMany({ where: { key: `project.forecast:${key}` } });
    await db.campaign.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("reads the project's registrations with their form answers, in Almaty time", async () => {
    const { folderRegistrations } = await import("@/lib/attendanceForecast/site");
    const data = (await folderRegistrations(key))!;
    expect(data.rows).toHaveLength(62);
    expect(data.filled).toMatchObject({ participationType: 60, university: 61, yearOfStudy: 60, segment: 1, major: 0 });
    const late = data.rows.find((r) => r.email === `bare@${tag}.kz`)!;
    expect([late.createdAt.getDate(), late.createdAt.getHours(), late.createdAt.getMinutes()]).toEqual([3, 0, 30]); // 19:30 UTC = 00:30 next day in Almaty
    expect(data.rows.find((r) => r.email === `imp@${tag}.kz`)).toMatchObject({ university: "ENU", segment: "P0 — Core" });
  });

  it("returns the forecast; the participant list only to admins", async () => {
    actor = admin;
    let res = await get("deadline=2026-11-10&target=20&people=1");
    expect(res.status).toBe(200);
    let body = await res.json();
    expect(body).toMatchObject({ registrations: 62, deadline: "2026-11-10", model: { beta: true } });
    expect(body.forecast).toMatchObject({ unique: 62, few: false, hasSegments: true, plan: { target: 20, reached: true } });
    expect(body.forecast.people).toHaveLength(62);

    actor = pm([key]);
    body = await (await get("deadline=2026-11-10&people=1")).json();
    expect(body.forecast.unique).toBe(62);
    expect(body.forecast.people).toBeUndefined();

    actor = pm(["someone-else-f26"]);
    expect((await get("deadline=2026-11-10")).status).toBe(403);
    actor = { ...admin, role: "viewer" };
    expect((await get("deadline=2026-11-10")).status).toBe(403);
  });

  it("remembers the project's deadline and asks for one until it is set", async () => {
    actor = admin;
    let body = await (await get("")).json();
    expect(body.deadline).toBeNull();
    expect(body.forecast).toBeNull();

    const put = await route.PUT(
      new NextRequest(`http://x/api/project-folders/${key}/attendance-forecast`, { method: "PUT", body: JSON.stringify({ deadline: "2026-11-12", target: 150 }), headers: { "content-type": "application/json" } }),
      { params: Promise.resolve({ key }) },
    );
    expect(put.status).toBe(200);
    body = await (await get("")).json();
    expect(body).toMatchObject({ deadline: "2026-11-12", target: 150, forecast: { deadline: "2026-11-12", plan: { target: 150 } } });
    expect((await get("deadline=12.11.2026")).status).toBe(422);
  });

  it("is hidden when the beta is switched off", async () => {
    process.env.ATTENDANCE_FORECAST_BETA = "off";
    try {
      expect((await get("deadline=2026-11-10")).status).toBe(404);
    } finally {
      delete process.env.ATTENDANCE_FORECAST_BETA;
    }
  });
});
