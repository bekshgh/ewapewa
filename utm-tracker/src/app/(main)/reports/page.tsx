import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { BulkReportUpload } from "@/components/reports/BulkReportUpload";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { currentActor } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const VIS = { private: "private", link: "link", public: "public" } as const;

export default async function ReportsPage() {
  const admin = isAdmin(await currentActor());
  const [reports, projects] = await Promise.all([
    prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, title: true, eventName: true, type: true, status: true, visibility: true, createdAt: true, project: { select: { name: true } } },
    }),
    prisma.project.findMany({ orderBy: { startDate: "desc" }, select: { id: true, slug: true, name: true } }),
  ]);
  const types = await prisma.projectType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });

  return (
    <>
      <PageHeader
        breadcrumb="Reports"
        title="Reports"
        subtitle="Upload an event's Excel analysis (Feedback or Registration) and get an interactive report."
      />

      {admin && (
        <section className="card mb-6 p-6">
          <h2 className="mb-1 font-display text-lg font-semibold">Upload reports</h2>
          <p className="mb-4 text-sm text-ink-muted">One file or many at once. Each event becomes a project, ready to compare in Projects.</p>
          <BulkReportUpload projects={projects} types={types.map((t) => ({ value: t.key, label: t.name }))} />
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold">All reports</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-6 py-3 font-medium">Report</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Visibility</th>
                <th className="px-6 py-3 text-right font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-ink-faint">No reports yet.</td>
                </tr>
              )}
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-bg-hover/40">
                  <td className="px-6 py-3">
                    <Link href={admin ? `/reports/${r.id}` : `/report/${r.slug}`} className="font-medium text-ink hover:text-accent">{r.title}</Link>
                    <p className="text-xs text-ink-faint">{r.project ? `Project: ${r.project.name}` : r.eventName ?? ""}</p>
                  </td>
                  <td className="px-6 py-3 text-ink-muted">{r.type === "feedback" ? "Feedback" : "Registration"}</td>
                  <td className="px-6 py-3">
                    <Pill label={r.status === "published" ? "published" : "draft"} tone={r.status === "published" ? "success" : "paused"} />
                  </td>
                  <td className="px-6 py-3 text-ink-muted">{VIS[r.visibility]}</td>
                  <td className="px-6 py-3 text-right text-xs text-ink-faint">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
