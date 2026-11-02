import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { BetaBadge } from "@/components/ui/BetaBadge";
import { AccessDenied } from "@/components/AccessDenied";
import { AttendanceForecast } from "@/components/forecast/AttendanceForecast";
import { currentActor } from "@/lib/auth";
import { canEditFolder, isAdmin } from "@/lib/permissions";
import { allProjectGroups } from "@/lib/projectStats";
import { canUseForecast, forecastBetaEnabled, forecastSettings } from "@/lib/attendanceForecast/site";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Attendance forecast (beta): admins and project managers; the site's data only for their own folders. */
export default async function ForecastPage(props: { searchParams: Promise<{ folder?: string }> }) {
  if (!forecastBetaEnabled()) notFound();
  const actor = await currentActor();
  const t = await getT();
  if (!canUseForecast(actor)) return <AccessDenied title={t("Admins and project managers only")} />;

  const groups = (await allProjectGroups()).filter((g) => g.campaigns.some((c) => c.role.kind === "project") && canEditFolder(actor, g.key));
  const settings = await forecastSettings(groups.map((g) => g.key));
  const { folder } = await props.searchParams;

  return (
    <>
      <PageHeader
        breadcrumb={t("Projects")}
        title={t("Attendance forecast")}
        titleAction={<BetaBadge className="text-xs" />}
        subtitle={t("Beta: the model was trained on one past Business Cup. Use the forecast as a guide and check decisions against participants' answers in the bot.")}
      />
      <AttendanceForecast
        admin={isAdmin(actor)}
        initialFolder={folder}
        folders={groups.map((g) => ({ key: g.key, title: g.title, deadline: settings[g.key]?.deadline ?? null, target: settings[g.key]?.target ?? null }))}
      />
    </>
  );
}
