import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConversionSection } from "@/components/conversions/ConversionSection";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { SmallSample } from "@/components/projects/ProjectList";
import { STATUS_LABEL, fmtDate, fmtMetric, fmtNumber } from "@/components/projects/format";
import { prisma } from "@/lib/db";
import { googleStatus, listSnapshots } from "@/lib/conversions/actions";
import { loadState } from "@/lib/conversions/state";
import { CHANNEL_GROUPS, CONCENTRATION, THEMES, ZONES, labelOf } from "@/lib/projects/dictionaries";
import { toRow } from "@/lib/projects/rows";
import { getProjectSettings } from "@/lib/projects/settings";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** "Similar to this one": same type, registrations within ±50%. */
function similarQuery(typeKey: string, registrants: number | null) {
  const p = new URLSearchParams({ type: typeKey });
  if (registrants) p.set("regs", `${Math.round(registrants * 0.5)}..${Math.round(registrants * 1.5)}`);
  return p.toString().replace(/%2C/g, ",");
}

export default async function ProjectPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const [project, types, settings] = await Promise.all([
    prisma.project.findUnique({
      where: { slug: params.slug },
      include: { type: true, metrics: true, reports: { orderBy: { updatedAt: "desc" }, select: { id: true, slug: true, title: true, type: true, status: true, updatedAt: true } } },
    }),
    prisma.projectType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    getProjectSettings(prisma),
  ]);
  if (!project) notFound();
  const [conversion, snapshots] = await Promise.all([loadState(prisma, project.id), listSnapshots(prisma, project.id)]);
  // Active campaigns, plus the chosen one even if it was archived since.
  const campaigns = await prisma.campaign.findMany({
    where: { OR: [{ status: { not: "archived" } }, { id: conversion.config.ogxCampaign?.id ?? "" }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, label: true },
  });
  const r = toRow(project);
  const small = r.responses !== null && r.responses < settings.smallSampleN;
  const pct = (v: number | null, d = 0) => fmtMetric(v, { unit: "%", scale: 100, decimals: d });

  const groups: { title: string; items: [string, string][] }[] = [
    {
      title: "Scale",
      items: [
        ["Registrations (unique)", r.registrants === null ? "no data" : `${fmtNumber(r.registrants)}${r.submissions ? ` (${fmtNumber(r.submissions)} submissions)` : ""}`],
        ["Campaign length", fmtMetric(r.campaignDays, { unit: "days" })],
        ["Channels", fmtMetric(r.channelCount, {})],
        ["Feedback responses", fmtMetric(r.responses, {})],
        ["Response rate", pct(r.responseRate, 1)],
      ],
    },
    {
      title: "Results",
      items: [
        ["Organization score", fmtMetric(r.orgScore10, { unit: "/10", decimals: 2 })],
        ["NPS proxy", r.nps === null ? "no data" : `${r.nps > 0 ? "+" : ""}${fmtNumber(r.nps)}`],
        ["Composite score", fmtMetric(r.composite10, { unit: "/10", decimals: 2 })],
        ["Weakest area", r.weakestZone ? `${labelOf(ZONES, r.weakestZone)} · ${fmtNumber(r.weakestZoneScore10 ?? 0, 1)}/10` : "no data"],
        ["Strongest area", r.strongestZone ? `${labelOf(ZONES, r.strongestZone)} · ${fmtNumber(r.strongestZoneScore10 ?? 0, 1)}/10` : "no data"],
        ["Most praised", r.topPraiseTheme ? labelOf(THEMES, r.topPraiseTheme) : "no data"],
        ["Most criticised", r.topPainTheme ? labelOf(THEMES, r.topPainTheme) : "no data"],
      ],
    },
    {
      title: "Acquisition & audience",
      items: [
        ["Top channel group", r.topChannelGroup ? `${labelOf(CHANNEL_GROUPS, r.topChannelGroup)} · ${pct(r.topChannelShare)}` : "no data"],
        ["Top channel", r.topChannel ? `${r.topChannel} · ${pct(r.topChannelOwnShare)}` : "no data"],
        ["Channel concentration", r.concentrationLevel ? `${labelOf(CONCENTRATION, r.concentrationLevel)} · HHI ${fmtNumber(r.hhiGroups ?? 0, 2)}` : "no data"],
        ["Peak day", r.peakDayShare === null ? "no data" : `${pct(r.peakDayShare)} of registrations · ${r.isBursty ? "bursty" : "even"} campaign`],
        ["Top university", r.topUniversityName ? `${r.topUniversityName} · ${pct(r.topUniversityShare)}` : "no data"],
        ["New to AIESEC", pct(r.newToOrgShare)],
        ["Want an internship", pct(r.internshipShare)],
        ["Average age", fmtMetric(r.avgAge, { unit: "years", decimals: 1 })],
        ["Duplicate rate", pct(r.duplicateRate, 1)],
      ],
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb="Projects"
        title={project.name}
        subtitle={[project.type.name, STATUS_LABEL[project.status], fmtDate(r.startDate), project.city, project.ownerTeam].filter(Boolean).join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects?${similarQuery(project.type.key, r.registrants)}`} className="btn-ghost">Similar projects →</Link>
            <Link href="/projects" className="btn-ghost">← All projects</Link>
          </div>
        }
      />

      {small && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-accent">
          Few feedback responses <SmallSample n={r.responses!} /> — this project's scores may be noise.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {groups.map((g) => (
          <section key={g.title} className="card p-5">
            <h2 className="mb-3 font-display text-base font-semibold">{g.title}</h2>
            <dl className="divide-y divide-line text-sm">
              {g.items.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className={v === "no data" ? "text-right text-ink-faint" : "num text-right text-ink"}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <ConversionSection
        projectId={project.id}
        projectSlug={project.slug}
        initial={conversion}
        snapshots={snapshots}
        campaigns={campaigns}
        serviceAccountEmail={googleStatus().serviceAccountEmail}
      />

      <section className="card mt-6 p-5">
        <h2 className="mb-3 font-display text-base font-semibold">Project reports</h2>
        {project.reports.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No reports yet. Upload one in <Link href="/reports" className="text-accent hover:underline">Reports</Link> and choose this project.
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {project.reports.map((rep) => (
              <li key={rep.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/reports/${rep.id}`} className="font-medium text-ink hover:text-accent">{rep.title}</Link>
                <span className="text-xs text-ink-faint">
                  {rep.type === "feedback" ? "Feedback" : "Registration"} · {rep.status === "published" ? "published" : "draft"} · {formatDateTime(rep.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {project.metrics && <p className="mt-3 text-xs text-ink-faint">Metrics recomputed {formatDateTime(project.metrics.computedAt)} (formula version {project.metrics.metricsVersion}).</p>}
      </section>

      <details className="card mt-6 p-5">
        <summary className="cursor-pointer font-display text-base font-semibold">Edit project</summary>
        <div className="mt-4">
          <ProjectForm
            types={types.map((t) => ({ value: t.key, label: t.name }))}
            initial={{
              id: project.id,
              name: project.name,
              typeKey: project.type.key,
              format: project.format ?? "",
              status: project.status,
              startDate: r.startDate ?? "",
              endDate: r.endDate ?? "",
              city: project.city ?? "",
              venue: project.venue ?? "",
              ownerTeam: project.ownerTeam ?? "",
              tags: project.tags.join(", "),
            }}
          />
        </div>
      </details>
    </>
  );
}
