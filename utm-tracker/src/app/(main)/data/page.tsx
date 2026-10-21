import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { DataManager } from "@/components/DataManager";
import { LegacyImport } from "@/components/LegacyImport";
import { RegistrationImport } from "@/components/RegistrationImport";
import { AccessDenied } from "@/components/AccessDenied";
import { currentActor } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function DataPage() {
  if (!isAdmin(await currentActor())) return <AccessDenied />;
  const t = await getT();
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
        breadcrumb={t("Data")}
        title={t("Data management")}
        subtitle={t("Import from a previous tracker or a registrations sheet, or delete clicks, leads, links or campaigns.")}
      />
      <div className="mb-8">
        <LegacyImport />
      </div>
      <div className="mb-8">
        <RegistrationImport />
      </div>
      <DataManager
        stats={{ clicks, leads, links, campaigns: campaigns.length, webhookLogs }}
        campaigns={campaigns}
      />
    </>
  );
}
