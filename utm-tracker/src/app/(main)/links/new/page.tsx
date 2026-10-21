import Link from "next/link";
import { getT } from "@/lib/i18n/server";
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
  const t = await getT();
  if (!actor || actor.role === "viewer") return <AccessDenied title={t("Viewers cannot create links")} />;
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
      <PageHeader breadcrumb={t("Links")} title={t("Create link")} subtitle={t("One short link with your own UTM tags.")} />
      <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-ink-muted">
        <strong className="text-ink">{t("Making links for a campaign?")}</strong>{" "}
        <Link href="/campaigns" className="text-accent hover:underline">{t("Campaigns")}</Link> → {t("the campaign")} → <em>{t("Create UTM links")}</em>:{" "}
        {t("a whole set (Instagram, Telegram, partners, QR…) in one go, named and tagged the same way, with the domain of your choice. This page is for a single link that doesn't fit the set.")}
      </div>
      <CreateLinkForm campaigns={campaigns} domains={await linkDomains()} />
    </>
  );
}
