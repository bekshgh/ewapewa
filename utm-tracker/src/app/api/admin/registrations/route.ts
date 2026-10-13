import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isTeamMember, unauthorized } from "@/lib/reports/store";
import { MAX_FILE_BYTES, ReportFileError } from "@/lib/reports/xlsx";
import { RegistrationImportError, importRegistrations, readRegistrationFile } from "@/lib/registrationImport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST multipart/form-data { file: .xlsx, mode: "check" | "import", city?: string, onePerPerson?: "1" }
 * Turns a landing page's registrations sheet into leads (see lib/registrationImport).
 */
export async function POST(req: Request) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  if (!(await isTeamMember())) return unauthorized();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const mode = form?.get("mode") === "import" ? "import" : "check";
  const city = typeof form?.get("city") === "string" ? (form!.get("city") as string).trim() : "";
  const onePerPerson = form?.get("onePerPerson") === "1";
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Choose an .xlsx file with registrations." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "The file is larger than 4 MB. Delete unneeded sheets and try again." }, { status: 413 });
  }

  try {
    const parsed = await readRegistrationFile(Buffer.from(await file.arrayBuffer()));
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: `Sheet «${parsed.sheet}» has no registration rows.` }, { status: 400 });
    }
    return NextResponse.json(await importRegistrations(parsed, mode, { city: city || undefined, onePerPerson }));
  } catch (err) {
    if (err instanceof RegistrationImportError || err instanceof ReportFileError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("registration_import_failed", err);
    return NextResponse.json({ error: "Import failed. Nothing was saved if this was a check." }, { status: 500 });
  }
}
