import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { CampaignManager } from "@/components/CampaignManager";
import { prisma } from "@/lib/db";
import { groupCampaigns } from "@/lib/projectGroups";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { links: true } } },
  });

  const rows = campaigns.map((c) => ({
    id: c.id, name: c.name, label: c.label, description: c.description,
    funnel: c.funnel, season: c.season, type: c.type, status: c.status,
    linkCount: c._count.links,
  }));
  const folders = groupCampaigns(campaigns.filter((c) => c.status !== "archived"));

  return (
    <>
      <PageHeader breadcrumb="Campaigns" title="Campaigns" subtitle={`${rows.length} campaign${rows.length === 1 ? "" : "s"} total`} />

      {folders.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 font-display text-base font-semibold">Projects</h2>
          <p className="mb-3 text-xs text-ink-faint">
            Campaigns with the same project name are one folder: the project campaign plus its EwA2oGX / EwA2MXP campaigns.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {folders.map((f) => (
              <Link key={f.key} href={`/campaigns/projects/${f.key}`} className="card block p-4 transition hover:border-accent/60">
                <div className="font-medium text-ink">{f.title}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {f.campaigns.map((c) => (
                    <span key={c.id} className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-muted">{c.role.title}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <CampaignManager campaigns={rows} />
    </>
  );
}
