import { PageHeader } from "@/components/ui/PageHeader";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { linkDomains } from "@/lib/linkDomainsServer";
import { prisma } from "@/lib/db";
import { AccessDenied } from "@/components/AccessDenied";
import { currentActor, editableCampaignIds } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewLinkPage() {
  const actor = await currentActor();
  if (!actor || actor.role === "viewer") return <AccessDenied title="Viewers cannot create links" />;
  const [all, editable] = await Promise.all([
    prisma.campaign.findMany({
      where: { status: { not: "archived" } },
      select: { id: true, name: true, label: true },
      orderBy: { createdAt: "desc" },
    }),
    editableCampaignIds(actor),
  ]);
  // Project managers put links into the campaigns of their own projects.
  const campaigns = isAdmin(actor) ? all : all.filter((c) => editable.has(c.id));

  return (
    <>
      <PageHeader breadcrumb="Links" title="Create link" subtitle="Generate a new UTM-tracked short link in a few steps." />
      <CreateLinkForm campaigns={campaigns} domains={await linkDomains()} />
    </>
  );
}
