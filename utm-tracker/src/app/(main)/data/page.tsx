import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { DataManager } from "@/components/DataManager";
import { LegacyImport } from "@/components/LegacyImport";

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const [clicks, leads, links, campaigns, webhookLogs] = await Promise.all([
    prisma.clickEvent.count(),
    prisma.lead.count(),
    prisma.trackingLink.count(),
    prisma.campaign.findMany({ select: { id: true, name: true, label: true } }),
    prisma.webhookLog.count(),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb="Data"
        title="Data management"
        subtitle="Import from a previous tracker, or delete clicks, leads, links or campaigns."
      />
      <div className="mb-8">
        <LegacyImport />
      </div>
      <DataManager
        stats={{ clicks, leads, links, campaigns: campaigns.length, webhookLogs }}
        campaigns={campaigns}
      />
    </>
  );
}
