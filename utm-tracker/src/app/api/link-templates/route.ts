import { NextRequest, NextResponse } from "next/server";
import { KitError, allTemplates, deleteTemplate, saveTemplate, templateSchema } from "@/lib/linkKitServer";
import type { KitTemplate } from "@/lib/linkKit";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ templates: await allTemplates() });
}

/** POST { name, rows[] } — save a template (replaces one with the same name). */
export async function POST(req: NextRequest) {
  const parsed = templateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid template" }, { status: 422 });
  try {
    await saveTemplate(parsed.data as KitTemplate);
  } catch (err) {
    if (err instanceof KitError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ templates: await allTemplates() });
}

/** DELETE ?name=… */
export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  await deleteTemplate(name);
  return NextResponse.json({ templates: await allTemplates() });
}
