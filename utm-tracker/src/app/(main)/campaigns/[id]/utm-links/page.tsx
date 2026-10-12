import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkKitBuilder } from "@/components/LinkKitBuilder";
import { kitContext } from "@/lib/linkKitServer";
import { UTM_MEDIUMS, UTM_SOURCES } from "@/lib/constants";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "";

export default async function CampaignUtmLinksPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await kitContext(id);
  if (!ctx) notFound();
  const { campaign } = ctx;

  return (
    <>
      <PageHeader
        breadcrumb="Campaigns"
        title="Создать utm-ссылки"
        subtitle={`${campaign.label || campaign.name} · utm_campaign: ${campaign.name}`}
      />
      <LinkKitBuilder
        campaign={{ id: campaign.id, name: campaign.name, label: campaign.label, slugPrefix: campaign.slugPrefix }}
        links={ctx.links.map((l) => ({ slug: l.slug, utmSource: l.utmSource, utmMedium: l.utmMedium, utmContent: l.utmContent }))}
        takenSlugs={ctx.takenSlugs}
        campaigns={ctx.campaigns}
        templates={ctx.templates}
        commonDestination={ctx.commonDestination}
        base={BASE}
        sources={UTM_SOURCES.map((o) => o.value)}
        mediums={UTM_MEDIUMS.map((o) => o.value)}
      />
    </>
  );
}
