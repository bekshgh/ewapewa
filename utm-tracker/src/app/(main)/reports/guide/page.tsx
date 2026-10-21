import Link from "next/link";
import { AccessDenied } from "@/components/AccessDenied";
import { ReportKitGuide } from "@/components/reports/ReportKitGuide";
import { PageHeader } from "@/components/ui/PageHeader";
import { currentActor } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { CONFIGS } from "@/lib/reports/configs";
import { GUIDE_FILES, readGuideFile } from "@/lib/reports/guide/files";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "How to prepare a report file — EwA Tracker" };

export default async function ReportGuidePage() {
  if (!isAdmin(await currentActor())) return <AccessDenied />;
  const t = await getT();
  const [mainPrompt, skillReference, kit] = await Promise.all([
    readGuideFile(GUIDE_FILES.mainPrompt),
    readGuideFile(GUIDE_FILES.skillReference),
    readGuideFile(GUIDE_FILES.kit),
  ]);
  // Sheet lists come from the parser config, so the guide never drifts from what is read.
  const layouts = (["registration", "feedback"] as const).map((k) => ({
    label: CONFIGS[k].label,
    sheets: CONFIGS[k].sheets.map((s) => ({
      name: s.name,
      headings: (s.expect ?? []).map((re) => re.source),
    })),
  }));

  return (
    <>
      <PageHeader
        breadcrumb={t("Reports · Guide")}
        title={t("How to prepare a report file")}
        subtitle={t("One fixed format per report type, built by the report kit and checked before you upload it.")}
        action={<Link href="/reports" className="btn-ghost">← {t("Back to Reports")}</Link>}
      />
      <ReportKitGuide mainPrompt={mainPrompt} skillReference={skillReference} kit={kit} layouts={layouts} />
    </>
  );
}
