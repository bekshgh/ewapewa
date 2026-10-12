import { NextRequest, NextResponse } from "next/server";
import { KitError, campaignStructure } from "@/lib/linkKitServer";

export const dynamic = "force-dynamic";

/** GET — the source / medium / content rows of this campaign's links ("как в другой кампании"). */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    return NextResponse.json({ rows: await campaignStructure(id) });
  } catch (err) {
    if (err instanceof KitError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
