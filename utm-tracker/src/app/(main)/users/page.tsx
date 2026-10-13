import { PageHeader } from "@/components/ui/PageHeader";
import { AccessDenied } from "@/components/AccessDenied";
import { TeamManager } from "@/components/TeamManager";
import { currentActor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/permissions";
import { allProjectGroups } from "@/lib/projectStats";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const actor = await currentActor();
  if (!isAdmin(actor)) return <AccessDenied />;
  const [users, folders] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: { id: true, email: true, name: true, role: true, status: true, position: true, projectKeys: true, lastLoginAt: true, createdAt: true },
    }),
    allProjectGroups(),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb="Team"
        title="Team"
        subtitle="Approve new accounts and decide who can do what. Project managers edit only the projects you give them; everyone sees all numbers."
      />
      <TeamManager
        me={actor!.id}
        users={users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() }))}
        folders={folders.map((f) => ({ key: f.key, title: f.title }))}
      />
    </>
  );
}
