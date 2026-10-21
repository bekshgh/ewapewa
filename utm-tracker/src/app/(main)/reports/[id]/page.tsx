import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { ReportAdminActions } from "@/components/reports/ReportAdminActions";
import { ReportProjectSelect, ThemeMappingEditor } from "@/components/reports/ReportProjectLinks";
import { ReportUpload } from "@/components/reports/ReportUpload";
import { ReportView } from "@/components/reports/ReportView";
import { prisma } from "@/lib/db";
import type { ReportDocument } from "@/lib/reports/types";
import { formatDateTime } from "@/lib/utils";
import { AccessDenied } from "@/components/AccessDenied";
import { currentActor } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ReportAdminPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!isAdmin(await currentActor())) return <AccessDenied />;
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const t = await getT();
  const [report, projects] = await Promise.all([
    prisma.report.findUnique({
      where: { id: params.id },
      include: { themeMappings: { orderBy: { rawLabel: "asc" } } },
    }),
    prisma.project.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
  ]);
  if (!report) notFound();
  const doc = report.data as unknown as ReportDocument;

  const count = (kind: string) => doc.sheets.reduce((a, s) => a + s.sections.filter((x) => x.kind === kind).length, 0);
  const cards = doc.sheets.reduce(
    (a, s) => a + s.sections.reduce((b, x) => b + (x.kind === "kpiGroup" ? x.cards.length : 0), 0),
    0,
  );
  const stats: [string, number][] = [
    ["tabs", doc.sheets.length],
    ["tables", count("table")],
    ["KPI cards", cards],
    ["insight blocks", count("callouts")],
  ];

  return (
    <>
      <PageHeader
        breadcrumb={t("Reports")}
        title={report.title}
        subtitle={`${report.sourceFileName ?? t("file")} · ${t("updated {date}", { date: formatDateTime(report.updatedAt) })}${
          report.publishedAt ? ` · ${t("published {date}", { date: formatDateTime(report.publishedAt) })}` : ""
        }`}
        action={<Link href="/reports" className="btn-ghost">← {t("All reports")}</Link>}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">{t("Publishing")}</h2>
            <Pill label={report.status === "published" ? "published" : "draft"} tone={report.status === "published" ? "success" : "paused"} />
          </div>
          <ReportAdminActions id={report.id} slug={report.slug} status={report.status} visibility={report.visibility} />
          <div className="mt-4 border-t border-line pt-4">
            <ReportProjectSelect reportId={report.id} projectId={report.projectId} projects={projects} />
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-4 font-display text-lg font-semibold">{t("What was found in the file")}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse rounded-xl border border-line bg-bg-raised/60 p-3">
                <dt className="text-xs text-ink-faint">{t(label)}</dt>
                <dd className="num text-2xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>
          {doc.skippedSheets.length > 0 && (
            <p className="mt-4 text-xs text-ink-faint">
              {t("Not imported (raw and personal data): {list}", { list: doc.skippedSheets.map((s) => `${s.name} — ${t("{n} rows", { n: s.rows })}`).join(" · ") })}
            </p>
          )}
          {doc.warnings.length === 0 ? (
            <p className="mt-4 text-sm text-leads">✓ {t("All expected blocks were recognised.")}</p>
          ) : (
            <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
              <p className="font-medium text-accent">⚠ {t("Parser warnings ({n})", { n: doc.warnings.length })}</p>
              <ul className="mt-2 space-y-1 text-ink-muted">
                {doc.warnings.map((w, i) => (
                  <li key={i}>
                    {[w.sheet, w.section].filter(Boolean).join(" · ")}: {w.message}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-faint">{t("The report can still be published: blocks that were not found are simply not shown.")}</p>
            </div>
          )}
        </section>
      </div>

      {report.themeMappings.length > 0 && (
        <details className="card mb-6 p-6" open={report.themeMappings.some((m) => !m.confirmed)}>
          <summary className="cursor-pointer font-display text-lg font-semibold">{t("Open-answer themes → shared dictionary")}</summary>
          <div className="mt-4">
            <ThemeMappingEditor
              reportId={report.id}
              mappings={report.themeMappings.map((m) => ({ id: m.id, kind: m.kind, rawLabel: m.rawLabel, canonical: m.canonical, confirmed: m.confirmed }))}
            />
          </div>
        </details>
      )}

      <details className="card mb-6 p-6">
        <summary className="cursor-pointer font-display text-lg font-semibold">{t("Replace file (a newer version of the same event)")}</summary>
        <p className="mb-4 mt-2 text-sm text-ink-muted">{t("The link and status stay; the report data is replaced by a new file of the same type.")}</p>
        <ReportUpload mode="replace" reportId={report.id} />
      </details>

      <section className="rounded-2xl border border-dashed border-line p-4 sm:p-6">
        <p className="mb-4 text-xs font-medium uppercase tracking-wider text-ink-faint">{t("Preview — this is how the report looks via its link")}</p>
        <ReportView doc={doc} initialTab={searchParams.tab} />
      </section>
    </>
  );
}
