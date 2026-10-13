import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { formatNumber, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const forms = await prisma.analyticsForm.findMany({ orderBy: { updatedAt: "desc" } });
  const counts = await prisma.analyticsSession.groupBy({
    by: ["formId", "outcome"],
    where: { isTest: false },
    _count: { _all: true },
  });
  const per = (id: string) => {
    const rows = counts.filter((c) => c.formId === id);
    const total = rows.reduce((n, r) => n + r._count._all, 0);
    const success = rows.find((r) => r.outcome === "success")?._count._all ?? 0;
    return { total, success };
  };

  return (
    <>
      <PageHeader breadcrumb="Forms" title="Registration forms" subtitle="Where people drop off in the registration forms on the landings: funnel, every question, time and slices." />
      {forms.length === 0 ? (
        <div className="card p-6 text-sm text-ink-muted">
          No data yet. It appears after the landing with the analytics script gets its first visitor.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {forms.map((f) => {
            const c = per(f.id);
            return (
              <Link key={f.id} href={`/forms/${encodeURIComponent(f.id)}`} className="card block p-5 transition hover:border-accent/60">
                <div className="font-medium text-ink">{f.id}</div>
                {f.projectSlug && <div className="mt-0.5 text-xs text-ink-faint">project: {f.projectSlug}</div>}
                <div className="mt-3 flex gap-6 text-sm">
                  <span><b className="num text-ink">{formatNumber(c.total)}</b> <span className="text-ink-faint">sessions</span></span>
                  <span><b className="num text-leads">{formatNumber(c.success)}</b> <span className="text-ink-faint">sent</span></span>
                  <span><b className="num text-ink">{formatPercent(c.total ? (c.success / c.total) * 100 : 0)}</b> <span className="text-ink-faint">conversion</span></span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
