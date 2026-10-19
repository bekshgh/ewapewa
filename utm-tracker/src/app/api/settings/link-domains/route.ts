import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/auth";
import { domainListSchema, linkDomains, saveLinkDomains } from "@/lib/linkDomainsServer";

export const dynamic = "force-dynamic";

/** GET — the short-link domains: the main one first. */
export async function GET() {
  const a = await guard("active");
  if (a instanceof NextResponse) return a;
  return NextResponse.json({ domains: await linkDomains() });
}

/** PUT { domains: string[] } — the extra domains (admins). Each must also be added in Vercel → Domains. */
export async function PUT(req: NextRequest) {
  const a = await guard("admin");
  if (a instanceof NextResponse) return a;
  const parsed = z.object({ domains: domainListSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid domains" }, { status: 422 });
  return NextResponse.json({ domains: await saveLinkDomains(parsed.data.domains) });
}
