import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { formatNumber, formatPercent } from "@/lib/utils";
import { formTitle } from "@/lib/formAnalytics/filters";
import { allProjectGroups } from "@/lib/projectStats";
import { FormRename } from "@/components/FormRename";
import { currentActor } from "@/lib/auth";
import { canEditFolder, isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const t = await getT();
  const forms = await prisma.analyticsForm.findMany({ orderBy: { updatedAt: "desc" } });
  const counts = await prisma.analyticsSession.groupBy({
    by: ["formId", "outcome"],
    where: { isTest: false },
    _count: { _all: true },
  });
  const [groups, actor] = await Promise.all([allProjectGroups(), currentActor()]);
  const mayRename = (f: { projectSlug: string | null }) => (f.projectSlug ? canEditFolder(actor, f.projectSlug) : isAdmin(actor));
  const projectTitle = (k: string) => groups.find((g) => g.key === k)?.title ?? k;
  const per = (id: string) => {
    const rows = counts.filter((c) => c.formId === id);
    const total = rows.reduce((n, r) => n + r._count._all, 0);
    const success = rows.find((r) => r.outcome === "success")?._count._all ?? 0;
    return { total, success };
  };

  return (
    <>
      <PageHeader breadcrumb={t("Forms")} title={t("Registration forms")} subtitle={t("Where people drop off in the registration forms on the landings: funnel, every question, time and slices.")} />
      {forms.length === 0 ? (
        <div className="card p-6 text-sm text-ink-muted">
          {t("No data yet. Forms appear here by themselves after the first visitor: any form on a page with the /t.js line (Webhook tab), and the TopTalents.Sprint landing.")}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {forms.map((f) => {
            const c = per(f.id);
            return (
              <div key={f.id} className="card p-5 transition hover:border-accent/60">
                <div className="flex items-start gap-2">
                  <Link href={`/forms/${encodeURIComponent(f.id)}`} className="min-w-0 flex-1 pt-1 font-medium text-ink hover:text-accent">{formTitle(f)}</Link>
                  {mayRename(f) && <FormRename id={f.id} name={formTitle(f)} autoName={f.title || f.id} className="-mr-1.5 -mt-0.5" />}
                </div>
                <Link href={`/forms/${encodeURIComponent(f.id)}`} className="block">
                {f.pageUrl && <div className="mt-0.5 truncate text-xs text-ink-faint">{f.pageUrl.replace(/^https?:\/\//, "")}</div>}
                <div className="mt-0.5 text-xs text-ink-faint">{f.projectSlug ? t("project: {name}", { name: projectTitle(f.projectSlug) }) : t("no project yet")}</div>
                <div className="mt-3 flex gap-6 text-sm">
                  <span><b className="num text-ink">{formatNumber(c.total)}</b> <span className="text-ink-faint">{t("sessions")}</span></span>
                  <span><b className="num text-leads">{formatNumber(c.success)}</b> <span className="text-ink-faint">{t("sent")}</span></span>
                  <span><b className="num text-ink">{formatPercent(c.total ? (c.success / c.total) * 100 : 0)}</b> <span className="text-ink-faint">{t("conversion")}</span></span>
                </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
