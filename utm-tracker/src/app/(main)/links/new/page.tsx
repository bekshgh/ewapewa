import Link from "next/link";
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
      <PageHeader breadcrumb="Links" title="Create link" subtitle="One short link with your own UTM tags." />
      <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-ink-muted">
        <strong className="text-ink">Making links for a campaign?</strong> Use <Link href="/campaigns" className="text-accent hover:underline">Campaigns</Link> → the
        campaign → <em>Create UTM links</em>: a whole set (Instagram, Telegram, partners, QR…) in one go, named and tagged the same way,
        with the domain of your choice. This page is for a single link that doesn&apos;t fit the set.
      </div>
      <CreateLinkForm campaigns={campaigns} domains={await linkDomains()} />
    </>
  );
}
