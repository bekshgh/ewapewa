import { PageHeader } from "@/components/ui/PageHeader";
import { AccessDenied } from "@/components/AccessDenied";
import { Reconcile } from "@/components/reconcile/Reconcile";
import { currentActor } from "@/lib/auth";
import { canEditFolder } from "@/lib/permissions";
import { allProjectGroups } from "@/lib/projectStats";
import { canUseForecast } from "@/lib/attendanceForecast/site";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Registration check: the form's export against the project's leads, for admins and the project's managers. */
export default async function ReconcilePage(props: { searchParams: Promise<{ folder?: string }> }) {
  const actor = await currentActor();
  const t = await getT();
  if (!canUseForecast(actor)) return <AccessDenied title={t("Admins and project managers only")} />;

  const groups = (await allProjectGroups()).filter((g) => g.campaigns.some((c) => c.role.kind === "project") && canEditFolder(actor, g.key));
  const { folder } = await props.searchParams;

  return (
    <>
      <PageHeader
        breadcrumb={t("Projects")}
        title={t("Registration check")}
        subtitle={t("Compare the form's export (e.g. Zimran's candidate list) with the project's leads on the site: who the site missed, who is only on the site, and whose tags differ.")}
      />
      <Reconcile initialFolder={folder} folders={groups.map((g) => ({ key: g.key, title: g.title }))} />
    </>
  );
}
