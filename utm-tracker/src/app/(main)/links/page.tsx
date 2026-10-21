import { PageHeader } from "@/components/ui/PageHeader";
import { getT } from "@/lib/i18n/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinksTable, type LinkRow } from "@/components/LinksTable";
import { getLinkStats, uniqueClicksByLink } from "@/lib/analytics";
import { conversionRate } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { currentActor, editableCampaignIds } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const actor = await currentActor();
  const t = await getT();
  const [withStats, archived, editableIds, campaigns] = await Promise.all([
    getLinkStats("all"),
    prisma.trackingLink.findMany({
      where: { isArchived: true },
      include: { campaign: true, _count: { select: { clicks: true, leads: true } } },
      orderBy: { createdAt: "desc" },
    }),
    editableCampaignIds(actor),
    prisma.campaign.findMany({ select: { id: true, name: true } }),
  ]);
  // A link belongs to its campaign, or else to the campaign its utm_campaign names.
  const idByName = new Map(campaigns.map((c) => [c.name, c.id]));
  const admin = isAdmin(actor);
  const editable = (l: { campaignId: string | null; utmCampaign: string | null }) => {
    if (admin) return true;
    const cid = l.campaignId ?? (l.utmCampaign ? idByName.get(l.utmCampaign) : undefined);
    return !!cid && editableIds.has(cid);
  };

  const archivedUnique = await uniqueClicksByLink(null, archived.map((l) => l.id));
  const total = withStats.length + archived.length;

  const rows: LinkRow[] = [
    ...withStats.map((l) => ({
      id: l.id, name: l.name, slug: l.slug, shortDomain: l.shortDomain,
      utmSource: l.utmSource, utmMedium: l.utmMedium, utmContent: l.utmContent,
      campaignName: l.campaign?.label || l.campaign?.name || l.utmCampaign,
      clicks: l.clicks, leads: l.leads, cr: l.cr,
      isActive: l.isActive, isArchived: l.isArchived, createdAt: l.createdAt.toISOString(),
      editable: editable(l),
    })),
    ...archived.map((l) => ({
      id: l.id, name: l.name, slug: l.slug, shortDomain: l.shortDomain,
      utmSource: l.utmSource, utmMedium: l.utmMedium, utmContent: l.utmContent,
      campaignName: l.campaign?.label || l.campaign?.name || l.utmCampaign,
      clicks: l._count.clicks, leads: l._count.leads,
      cr: conversionRate(l._count.leads, archivedUnique.get(l.id) ?? 0),
      isActive: l.isActive, isArchived: l.isArchived, createdAt: l.createdAt.toISOString(),
      editable: editable(l),
    })),
  ];

  return (
    <>
      <PageHeader breadcrumb={t("Links")} title={t("All links")} subtitle={t("{n} links total", { n: total })} />
      {total === 0 ? (
        <EmptyState
          title={t("No links yet")}
          description={t("Create your first tracked link to start counting clicks and attributing leads from Tilda.")}
          ctaHref="/links/new"
          ctaLabel={t("Create your first link")}
        />
      ) : (
        <LinksTable links={rows} />
      )}
    </>
  );
}
