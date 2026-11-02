import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { buildForecast, DEFAULT_TARGET } from "@/lib/attendanceForecast/summary";
import { MODEL_INFO } from "@/lib/attendanceForecast/forecastCore";
import {
  canForecastFolder, folderRegistrations, forecastBetaEnabled, forecastSettings, forecastSettingsSchema, saveForecastSettings, wallClock,
} from "@/lib/attendanceForecast/site";

export const dynamic = "force-dynamic";

/** The beta is hidden: the route answers as if it did not exist. */
const off = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/**
 * GET ?deadline=YYYY-MM-DD&target=300&segments=1&people=1 — attendance forecast (beta) from the
 * folder's registrations on the site. Without a deadline the saved one is used; without either,
 * only the data overview comes back. The participant list (people=1) is for admins only.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ key: string }> }) {
  if (!forecastBetaEnabled()) return off();
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const { key } = await props.params;
  if (!canForecastFolder(actor, key)) return NextResponse.json({ error: "Only admins and this project's managers can see its forecast" }, { status: 403 });

  const data = await folderRegistrations(key);
  if (!data) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const q = req.nextUrl.searchParams;
  const saved = (await forecastSettings([key]))[key] ?? {};
  const deadline = q.get("deadline") || saved.deadline || null;
  const target = Number(q.get("target")) || saved.target || DEFAULT_TARGET;

  const forecast = deadline
    ? buildForecast(data.rows, {
        deadline, target, asOf: wallClock(new Date()),
        useSegments: q.get("segments") !== "0",
        withPeople: q.get("people") === "1" && isAdmin(actor),
      })
    : null;
  if (deadline && !forecast) return NextResponse.json({ error: "Deadline must be a date (YYYY-MM-DD)" }, { status: 422 });
  return NextResponse.json({ model: MODEL_INFO, registrations: data.rows.length, filled: data.filled, deadline, target, forecast });
}

/** PUT { deadline, target } — the folder's registration deadline, for its managers and admins. */
export async function PUT(req: NextRequest, props: { params: Promise<{ key: string }> }) {
  if (!forecastBetaEnabled()) return off();
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const { key } = await props.params;
  if (!canForecastFolder(actor, key)) return NextResponse.json({ error: "Only admins and this project's managers can change its deadline" }, { status: 403 });
  const parsed = forecastSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Deadline must be a date (YYYY-MM-DD)" }, { status: 422 });
  await saveForecastSettings(key, parsed.data);
  return NextResponse.json({ ok: true });
}
