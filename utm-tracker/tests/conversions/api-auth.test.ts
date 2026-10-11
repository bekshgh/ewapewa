import { describe, expect, it, vi } from "vitest";

// Not an admin: every conversion endpoint must refuse before touching data.
vi.mock("@/lib/reports/store", async (orig) => ({ ...(await orig<object>()), isAdmin: async () => false }));
const dbTouched = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: new Proxy({}, { get: () => { dbTouched(); throw new Error("db must not be used"); } }) }));

const ctx = { params: Promise.resolve({ id: "p1" }) };
const req = (method: string, body?: unknown) =>
  new Request("http://x/api", { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

describe("conversion API without an admin session", () => {
  it("refuses every route with 401", async () => {
    const main = await import("@/app/api/projects/[id]/conversion/route");
    const refresh = await import("@/app/api/projects/[id]/conversion/refresh/route");
    const sheet = await import("@/app/api/projects/[id]/conversion/sheet/route");
    const upload = await import("@/app/api/projects/[id]/conversion/upload/route");
    const snapshots = await import("@/app/api/projects/[id]/conversion/snapshots/route");
    const review = await import("@/app/api/projects/[id]/conversion/review/route");
    const calls = [
      main.GET(req("GET"), ctx),
      main.PATCH(req("PATCH", { manual: { showUp: 300 } }), ctx),
      refresh.POST(req("POST"), ctx),
      sheet.POST(req("POST", { link: "x" })),
      upload.POST(req("POST"), ctx),
      snapshots.GET(req("GET"), ctx),
      snapshots.POST(req("POST", {}), ctx),
      review.GET(req("GET"), ctx),
      review.POST(req("POST", { source: "ogx", keys: ["k"], decision: "approved" }), ctx),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
    expect(dbTouched).not.toHaveBeenCalled();
  });
});
