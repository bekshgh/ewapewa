import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinksTable, type LinkRow } from "@/components/LinksTable";
import { getLinkStats, uniqueClicksByLink } from "@/lib/analytics";
import { conversionRate } from "@/lib/utils";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const [withStats, archived] = await Promise.all([
    getLinkStats("all"),
    prisma.trackingLink.findMany({
      where: { isArchived: true },
      include: { campaign: true, _count: { select: { clicks: true, leads: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const archivedUnique = await uniqueClicksByLink(null, archived.map((l) => l.id));
  const total = withStats.length + archived.length;

  const rows: LinkRow[] = [
    ...withStats.map((l) => ({
      id: l.id, name: l.name, slug: l.slug,
      utmSource: l.utmSource, utmMedium: l.utmMedium, utmContent: l.utmContent,
      campaignName: l.campaign?.label || l.campaign?.name || l.utmCampaign,
      clicks: l.clicks, leads: l.leads, cr: l.cr,
      isActive: l.isActive, isArchived: l.isArchived, createdAt: l.createdAt.toISOString(),
    })),
    ...archived.map((l) => ({
      id: l.id, name: l.name, slug: l.slug,
      utmSource: l.utmSource, utmMedium: l.utmMedium, utmContent: l.utmContent,
      campaignName: l.campaign?.label || l.campaign?.name || l.utmCampaign,
      clicks: l._count.clicks, leads: l._count.leads,
      cr: conversionRate(l._count.leads, archivedUnique.get(l.id) ?? 0),
      isActive: l.isActive, isArchived: l.isArchived, createdAt: l.createdAt.toISOString(),
    })),
  ];

  return (
    <>
      <PageHeader breadcrumb="Links" title="All links" subtitle={`${total} link${total === 1 ? "" : "s"} total`} />
      {total === 0 ? (
        <EmptyState
          title="No links yet"
          description="Create your first tracked link to start counting clicks and attributing leads from Tilda."
          ctaHref="/links/new"
          ctaLabel="Create your first link"
        />
      ) : (
        <LinksTable links={rows} />
      )}
    </>
  );
}
