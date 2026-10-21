import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { oldNames } from "@/lib/oldNames";
import { projectName } from "@/lib/projects/validation";
import { parseProjectName, seasonOf } from "@/lib/naming";

export const dynamic = "force-dynamic";

/** GET — projects and campaigns named before the "<Project> F'26" rule, with suggestions. */
export async function GET() {
  const a = await guard("admin");
  if (a instanceof NextResponse) return a;
  return NextResponse.json({ items: await oldNames() });
}

const body = z.object({
  items: z.array(z.object({ kind: z.enum(["project", "campaign"]), id: z.string().min(1), name: projectName })).min(1).max(500),
});

/** POST { items: [{ kind, id, name }] } — rename them (the utm_campaign value of a campaign stays). */
export async function POST(req: NextRequest) {
  const a = await guard("admin");
  if (a instanceof NextResponse) return a;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the names" }, { status: 422 });
  await prisma.$transaction(
    parsed.data.items.map((i) => {
      if (i.kind === "project") return prisma.project.update({ where: { id: i.id }, data: { name: i.name } });
      const term = parseProjectName(i.name)?.term;
      return prisma.campaign.update({ where: { id: i.id }, data: { label: i.name, ...(term ? { season: seasonOf(term) } : {}) } });
    }),
  );
  return NextResponse.json({ renamed: parsed.data.items.length });
}
