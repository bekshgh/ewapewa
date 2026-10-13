import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewBadge } from "@/components/ui/NewBadge";
import { ProjectNumbers } from "@/components/ProjectNumbers";
import { currentActor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditFolder } from "@/lib/permissions";
import { folderNumbers } from "@/lib/projectNumbers";
import { formatNumber, formatPercent } from "@/lib/utils";
import { manualNumbers, projectStats, type ChannelRow, type CampaignStats } from "@/lib/projectStats";

export const dynamic = "force-dynamic";

export default async function ProjectFolderPage(props: { params: Promise<{ key: string }> }) {
  const { key } = await props.params;
  const [s, manual, actor, forms] = await Promise.all([
    projectStats(key), manualNumbers(key), currentActor(),
    prisma.analyticsForm.findMany({ where: { projectSlug: key }, select: { id: true } }),
  ]);
  if (!s) notFound();
  const programmes = s.campaigns.filter((c) => c.role.kind === "programme");

  return (
    <>
      <PageHeader
        breadcrumb="Campaigns · Project"
        title={s.group.title}
        subtitle={s.campaigns.map((c) => `${c.role.title}: ${c.label || c.name}`).join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            {forms.map((f) => <Link key={f.id} href={`/forms/${encodeURIComponent(f.id)}`} className="btn-ghost">Form drop-off <NewBadge className="ml-1" /> →</Link>)}
            <Link href="/campaigns" className="btn-ghost">← All campaigns</Link>
          </div>
        }
      />

      <ProjectNumbers
        folder={s.group.key}
        editable={canEditFolder(actor, s.group.key)}
        numbers={folderNumbers(
          {
            projectRegs: s.projectCampaignIds.length ? s.totals.projectRegs : null,
            programmes: programmes.map((c) => ({ id: c.id, title: c.role.title, leads: c.leads })),
          },
          manual,
        )}
      />

      {programmes.length > 0 && s.totals.projectRegs > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="font-display text-base font-semibold">Who went on from the project</h2>
          <p className="mt-1 text-xs text-ink-faint">
            Tracker data: programme registrants who are also among the project&apos;s registrants (same e-mail or phone).
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 font-medium">Programme</th>
                  <th className="pb-2 text-right font-medium">Registrations (tracker)</th>
                  <th className="pb-2 text-right font-medium">Also registered for the project</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {programmes.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 text-ink">{c.role.title}</td>
                    <td className="num py-2.5 text-right text-leads">{formatNumber(c.leads)}</td>
                    <td className="num py-2.5 text-right text-ink-muted">
                      {c.fromProject === null ? "—" : `${formatNumber(c.fromProject)} (${formatPercent((c.fromProject / s.totals.projectRegs) * 100)} of project regs)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <CampaignsTable rows={s.campaigns} />

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChannelTable title="By source" head="Source" rows={s.bySource} campaigns={s.campaigns} />
        <ChannelTable title="By channel (utm_content)" head="Channel" rows={s.byContent} campaigns={s.campaigns} />
      </section>
    </>
  );
}

function CampaignsTable({ rows }: { rows: CampaignStats[] }) {
  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold">Campaigns</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="pb-2 font-medium">Campaign</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 text-right font-medium">Links</th>
              <th className="pb-2 text-right font-medium">Clicks</th>
              <th className="pb-2 text-right font-medium">Unique</th>
              <th className="pb-2 text-right font-medium">Leads</th>
              <th className="pb-2 text-right font-medium">CR%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-bg-hover/40">
                <td className="py-2.5">
                  <Link href={`/campaigns/${c.id}`} className="font-medium text-ink hover:text-accent">{c.label || c.name}</Link>
                  <div className="text-xs text-ink-faint">{c.name}</div>
                </td>
                <td className="py-2.5 text-ink-muted">{c.role.title}</td>
                <td className="num py-2.5 text-right text-ink-muted">{formatNumber(c.links)}</td>
                <td className="num py-2.5 text-right text-ink-muted">{formatNumber(c.clicks)}</td>
                <td className="num py-2.5 text-right text-ink-muted">{formatNumber(c.uniqueClicks)}</td>
                <td className="num py-2.5 text-right text-leads">{formatNumber(c.leads)}</td>
                <td className="num py-2.5 text-right font-medium text-ink">{c.uniqueClicks ? formatPercent(c.cr) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChannelTable({ title, head, rows, campaigns }: { title: string; head: string; rows: ChannelRow[]; campaigns: CampaignStats[] }) {
  const project = campaigns.filter((c) => c.role.kind === "project");
  const programmes = campaigns.filter((c) => c.role.kind === "programme");
  const sum = (r: ChannelRow, cs: CampaignStats[]) => cs.reduce((n, c) => n + (r.leads[c.id] ?? 0), 0);
  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-faint">No data yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="pb-2 font-medium">{head}</th>
                <th className="pb-2 text-right font-medium">Unique clicks</th>
                <th className="pb-2 text-right font-medium">Project regs</th>
                {programmes.map((c) => (
                  <th key={c.id} className="pb-2 text-right font-medium">{c.role.title.replace("EwA2", "")} regs</th>
                ))}
                {programmes.length > 0 && <th className="pb-2 text-right font-medium">Programme ÷ project</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.slice(0, 30).map((r) => {
                const p = sum(r, project);
                const g = sum(r, programmes);
                return (
                  <tr key={r.key} className="hover:bg-bg-hover/40">
                    <td className="py-2.5 text-ink">{r.key}</td>
                    <td className="num py-2.5 text-right text-ink-muted">{formatNumber(r.uniqueClicks)}</td>
                    <td className="num py-2.5 text-right text-leads">{formatNumber(p)}</td>
                    {programmes.map((c) => (
                      <td key={c.id} className="num py-2.5 text-right text-leads">{formatNumber(r.leads[c.id] ?? 0)}</td>
                    ))}
                    {programmes.length > 0 && <td className="num py-2.5 text-right font-medium text-ink">{p ? formatPercent((g / p) * 100) : "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
