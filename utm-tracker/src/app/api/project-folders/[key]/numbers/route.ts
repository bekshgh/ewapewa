import { NextRequest, NextResponse } from "next/server";
import { manualNumbersSchema } from "@/lib/projectNumbers";
import { allProjectGroups, saveManualNumbers } from "@/lib/projectStats";

export const dynamic = "force-dynamic";

/** PUT { projectRegs?, showUp?, signups?, programmes?: { [campaignId]: n } } — a missing number goes back to the tracker's. */
export async function PUT(req: NextRequest, props: { params: Promise<{ key: string }> }) {
  const { key } = await props.params;
  const group = (await allProjectGroups()).find((g) => g.key === key);
  if (!group) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const parsed = manualNumbersSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Numbers must be whole and not negative" }, { status: 422 });

  // Keep only programmes that are in this folder.
  const ids = new Set(group.campaigns.filter((c) => c.role.kind === "programme").map((c) => c.id));
  const programmes = Object.fromEntries(Object.entries(parsed.data.programmes ?? {}).filter(([id]) => ids.has(id)));
  await saveManualNumbers(key, { ...parsed.data, programmes });
  return NextResponse.json({ ok: true });
}
