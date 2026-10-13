import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { canView, isTeamMember } from "@/lib/reports/store";
import type { ReportDocument } from "@/lib/reports/types";
import { ReportView } from "@/components/reports/ReportView";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const report = await prisma.report.findUnique({ where: { slug } });
  const admin = await isTeamMember();
  // Private / draft reports look exactly like missing ones to visitors.
  if (!report || !canView(report, admin)) return null;
  return { report, admin };
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const found = await load(params.slug);
  if (!found) return { title: "Report not found", robots: { index: false, follow: false } };
  const { report } = found;
  const indexable = report.status === "published" && report.visibility === "public";
  return {
    title: report.title,
    robots: indexable ? undefined : { index: false, follow: false },
  };
}

export default async function ReportPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const found = await load(params.slug);
  if (!found) notFound();
  const { report, admin } = found;
  const doc = report.data as unknown as ReportDocument;

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-8 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <span className="font-display text-sm font-semibold tracking-tight text-ink-muted">EwA · Reports</span>
        {admin && (
          <Link href={`/reports/${report.id}`} className="btn-ghost py-1.5 text-xs">
            ← Manage report
          </Link>
        )}
      </div>
      {admin && (report.status !== "published" || report.visibility === "private") && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-accent print:hidden">
          {report.status !== "published" ? "Draft: only you can see this report." : "Private report: visible to signed-in admins only."}
        </p>
      )}
      <ReportView doc={doc} initialTab={searchParams.tab} />
    </main>
  );
}
