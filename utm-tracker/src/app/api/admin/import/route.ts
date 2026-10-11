import { NextResponse } from "next/server";
import { z } from "zod";
import { importLegacy, inspectLegacy, isPostgresUrl } from "@/lib/legacyImport";
import { isAdmin, unauthorized } from "@/lib/reports/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Thousands of rows take seconds; give slow databases room. Re-running continues where it stopped.
export const maxDuration = 300;

const bodySchema = z.object({
  url: z.string().refine(isPostgresUrl, "Paste the full database address, starting with postgres:// or postgresql://"),
  mode: z.enum(["check", "import"]),
});

/** The connection string is used for this request only: never stored or logged. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { url, mode } = parsed.data;

  if (url.trim() === process.env.DATABASE_URL?.trim() || url.trim() === process.env.DIRECT_URL?.trim()) {
    return NextResponse.json({ error: "This is the address of this site's own database. Paste the old site's one." }, { status: 400 });
  }

  try {
    if (mode === "check") return NextResponse.json({ tables: await inspectLegacy(url) });
    return NextResponse.json(await importLegacy(url));
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).split(url.trim()).join("<address>");
    console.error("legacy_import_failed", message);
    return NextResponse.json({ error: `Could not ${mode === "check" ? "read" : "import from"} the old database: ${message.trim().split("\n").pop()}` }, { status: 502 });
  }
}
