import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canForecastFolder, folderLeadWhere, wallClock } from "@/lib/attendanceForecast/site";
import type { SiteLead } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * GET — the folder's leads for the registration check (/reconcile): contact, time and tags only.
 * The export they are compared with stays in the browser. Admins and this project's managers.
 */
export async function GET(_req: Request, props: { params: Promise<{ key: string }> }) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const { key } = await props.params;
  if (!canForecastFolder(actor, key)) return NextResponse.json({ error: "Only admins and this project's managers can check its registrations" }, { status: 403 });

  const where = await folderLeadWhere(key);
  if (!where) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const leads = await prisma.lead.findMany({
    where,
    select: {
      email: true, phone: true, submittedAt: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true,
      clickId: true, trackingLinkId: true, dedupeKey: true,
    },
    orderBy: { submittedAt: "asc" },
  });
  const out: SiteLead[] = leads.map((l) => ({
    email: l.email, phone: l.phone, at: stamp(wallClock(l.submittedAt)),
    source: l.utmSource, medium: l.utmMedium, campaign: l.utmCampaign, content: l.utmContent,
    kind: l.dedupeKey.startsWith("dr:") ? "direct" : l.dedupeKey.startsWith("reg:") ? "import" : l.clickId || l.trackingLinkId ? "link" : "form",
  }));
  return NextResponse.json({ leads: out });
}
