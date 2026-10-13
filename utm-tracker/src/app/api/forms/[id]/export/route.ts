import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { fieldTable, sessions } from "@/lib/formAnalytics/report";
import { fieldLabel, parseFilter } from "@/lib/formAnalytics/filters";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";

/** GET ?kind=fields|sessions&<report filters> — the report as CSV (opens in Excel). */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const id = decodeURIComponent((await props.params).id);
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const f = parseFilter(id, sp);
  let body: string;
  if (sp.kind === "sessions") {
    const rows = await sessions(f, 10_000);
    body = csv([
      ["session", "started_at", "last_seen_at", "outcome", "last_question", "utm_source", "utm_campaign", "device", "lang", "country", "city", "relocation", "events", "test"],
      ...rows.map((s) => [s.id, s.startedAt, s.lastSeenAt, s.outcome, s.lastField ?? "", s.utmSource, s.utmCampaign, s.device, s.lang, s.country, s.city, s.relocation, s.events, s.isTest]),
    ]);
  } else {
    const rows = await fieldTable(f);
    body = csv([
      ["question", "field", "conditional", "shown", "reached", "filled", "left_here", "drop_off_pct", "error_rate_pct", "avg_ms", "median_ms", "revisits"],
      ...rows.map((r) => [fieldLabel(r.k), r.k, r.conditional, r.shown ?? "", r.reached, r.filled, r.leftHere, r.dropOff.toFixed(1), r.errorRate.toFixed(1), r.avgMs ?? "", r.medianMs ?? "", r.refocus]),
    ]);
  }
  const name = `${id}-${sp.kind === "sessions" ? "sessions" : "questions"}.csv`.replace(/[^A-Za-z0-9_.-]/g, "_");
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
