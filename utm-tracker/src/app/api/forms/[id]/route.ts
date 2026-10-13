import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forbidden, guard } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditFolder } from "@/lib/permissions";
import { allProjectGroups } from "@/lib/projectStats";

export const dynamic = "force-dynamic";

const body = z.object({ projectSlug: z.string().max(80).nullable() });

/**
 * PATCH { projectSlug } — attach a form to a project folder by hand (null
 * detaches it). After that the page's links and UTM no longer move it.
 * Allowed to whoever may edit both the folder it leaves and the one it joins.
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("active");
  if (actor instanceof NextResponse) return actor;
  const id = decodeURIComponent((await props.params).id);
  const form = await prisma.analyticsForm.findUnique({ where: { id } });
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a project" }, { status: 422 });
  const next = parsed.data.projectSlug || null;
  if (next && !(await allProjectGroups()).some((g) => g.key === next)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const may = (key: string | null) => (key ? canEditFolder(actor, key) : actor.role === "admin");
  if (!may(next) || (form.projectSlug && !may(form.projectSlug))) return forbidden();

  await prisma.$transaction([
    prisma.analyticsForm.update({ where: { id }, data: { projectSlug: next, projectSetByHand: true } }),
    prisma.analyticsSession.updateMany({ where: { formId: id }, data: { projectSlug: next } }),
  ]);
  return NextResponse.json({ ok: true });
}
