import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  position: z.string().trim().max(80).nullable().optional(),
  role: z.enum(["admin", "manager", "viewer"]).optional(),
  status: z.enum(["pending", "active", "disabled", "declined"]).optional(),
  projectKeys: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
});

/** PATCH — an admin approves, declines, disables, or changes someone's role, position and projects. */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const { id } = await props.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 422 });
  const d = parsed.data;

  // Nobody locks themselves out: an admin cannot demote or disable their own account.
  if (id === actor.id && ((d.role && d.role !== "admin") || (d.status && d.status !== "active"))) {
    return NextResponse.json({ error: "You cannot remove your own admin access. Ask another admin." }, { status: 409 });
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // approving or declining a sign-up records who decided and when
  const decision = d.status && d.status !== user.status && (d.status === "declined" || (d.status === "active" && (user.status === "pending" || user.status === "declined")));

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.position !== undefined && { position: d.position || null }),
      ...(d.role !== undefined && { role: d.role }),
      ...(d.status !== undefined && { status: d.status }),
      ...(decision && { decidedAt: new Date(), decidedBy: actor.name || actor.email }),
      ...(d.projectKeys !== undefined && { projectKeys: [...new Set(d.projectKeys)] }),
    },
    select: { id: true, role: true, status: true, position: true, projectKeys: true },
  });
  return NextResponse.json(updated);
}

/** DELETE — remove an account for good (declining keeps it: PATCH status "declined"). */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const { id } = await props.params;
  if (id === actor.id) return NextResponse.json({ error: "You cannot delete your own account" }, { status: 409 });
  await prisma.$transaction([
    prisma.campaign.updateMany({ where: { userId: id }, data: { userId: null } }),
    prisma.trackingLink.updateMany({ where: { userId: id }, data: { userId: null } }),
    prisma.user.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
