import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/session";
import { purgeAnalytics } from "@/lib/formAnalytics/purge";

export const dynamic = "force-dynamic";

/** Daily Vercel Cron (vercel.json): Vercel sends "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await purgeAnalytics());
}
