import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isTeamMember, readUpload, unauthorized } from "@/lib/reports/store";
import { summarize } from "@/lib/projects/grouping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Bulk upload, step 1: parse one file and say what it is (type, event, date)
 * so files can be grouped into projects before anything is saved.
 * Nothing is stored.
 */
export async function POST(req: Request) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  if (!(await isTeamMember())) return unauthorized();
  const up = await readUpload(req);
  if (up instanceof NextResponse) return up;
  return NextResponse.json({ fileName: up.fileName, ...summarize(up.doc) });
}
