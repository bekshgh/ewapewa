import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canEditCampaign, forbidden, guard } from "@/lib/auth";
import { KitError, createKit, kitSchema } from "@/lib/linkKitServer";

export const dynamic = "force-dynamic";

/** POST { slugPrefix, destinationUrl, rows[] } — create the campaign's UTM links in one go. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const { id } = await props.params;
  if (!(await canEditCampaign(actor, id))) return forbidden("this campaign");
  const parsed = kitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 422 });
  }
  try {
    return NextResponse.json(await createKit(id, parsed.data));
  } catch (err) {
    if (err instanceof KitError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That project code or a slug was just taken. Reload and try again." }, { status: 409 });
    }
    throw err;
  }
}
