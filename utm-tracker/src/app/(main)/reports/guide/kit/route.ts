import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { GUIDE_FILES, readGuideFile } from "@/lib/reports/guide/files";

export const dynamic = "force-dynamic";

/** GET /reports/guide/kit — report_kit.py as a download (admins, like the guide page). */
export async function GET() {
  const a = await guard("admin");
  if (a instanceof NextResponse) return a;
  const body = await readGuideFile(GUIDE_FILES.kit);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/x-python; charset=utf-8",
      "Content-Disposition": `attachment; filename="${GUIDE_FILES.kit}"`,
      "Cache-Control": "no-store",
    },
  });
}
