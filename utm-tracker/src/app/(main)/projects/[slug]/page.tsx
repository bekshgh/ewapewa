import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { SmallSample } from "@/components/projects/ProjectList";
import { STATUS_LABEL, fmtDate, fmtMetric, fmtNumber } from "@/components/projects/format";
import { prisma } from "@/lib/db";
import { CHANNEL_GROUPS, CONCENTRATION, THEMES, ZONES, labelOf } from "@/lib/projects/dictionaries";
import { toRow } from "@/lib/projects/rows";
import { getProjectSettings } from "@/lib/projects/settings";
import { formatDateTime } from "@/lib/utils";
import { currentActor } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { utmCampaignOf } from "@/lib/naming";
import { getLang, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** "Similar to this one": same type, registrations within ±50%. */
function similarQuery(typeKey: string, registrants: number | null) {
  const p = new URLSearchParams({ type: typeKey });
  if (registrants) p.set("regs", `${Math.round(registrants * 0.5)}..${Math.round(registrants * 1.5)}`);
  return p.toString().replace(/%2C/g, ",");
}

export default async function ProjectPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const admin = isAdmin(await currentActor());
  const [project, types, settings] = await Promise.all([
    prisma.project.findUnique({
      where: { slug: params.slug },
      include: { type: true, metrics: true, reports: { orderBy: { updatedAt: "desc" }, select: { id: true, slug: true, title: true, type: true, status: true, updatedAt: true } } },
    }),
    prisma.projectType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    getProjectSettings(prisma),
  ]);
  if (!project) notFound();
  // its campaign (UTM links, leads): the one named like the project
  const campaign = await prisma.campaign.findFirst({
    where: { OR: [{ label: { equals: project.name, mode: "insensitive" } }, { name: utmCampaignOf(project.name) }] },
    select: { id: true },
  });
  const r = toRow(project);
  const ND = t("no data");
  const fm = (x: unknown, f: Parameters<typeof fmtMetric>[1]) => fmtMetric(x, f, lang);
  const small = r.responses !== null && r.responses < settings.smallSampleN;
  const pct = (v: number | null, d = 0) => fm(v, { unit: "%", scale: 100, decimals: d });

  const groups: { title: string; items: [string, string][] }[] = [
    {
      title: "Scale",
      items: [
        ["Registrations (unique)", r.registrants === null ? ND : `${fmtNumber(r.registrants)}${r.submissions ? ` (${t("{n} submissions", { n: fmtNumber(r.submissions) })})` : ""}`],
        ["Campaign length", fm(r.campaignDays, { unit: "days" })],
        ["Channels", fm(r.channelCount, {})],
        ["Feedback responses", fm(r.responses, {})],
        ["Response rate", pct(r.responseRate, 1)],
      ],
    },
    {
      title: "Results",
      items: [
        ["Organization score", fm(r.orgScore10, { unit: "/10", decimals: 2 })],
        ["NPS proxy", r.nps === null ? ND : `${r.nps > 0 ? "+" : ""}${fmtNumber(r.nps)}`],
        ["Composite score", fm(r.composite10, { unit: "/10", decimals: 2 })],
        ["Weakest area", r.weakestZone ? `${t(labelOf(ZONES, r.weakestZone))} · ${fmtNumber(r.weakestZoneScore10 ?? 0, 1)}/10` : ND],
        ["Strongest area", r.strongestZone ? `${t(labelOf(ZONES, r.strongestZone))} · ${fmtNumber(r.strongestZoneScore10 ?? 0, 1)}/10` : ND],
        ["Most praised", r.topPraiseTheme ? t(labelOf(THEMES, r.topPraiseTheme)) : ND],
        ["Most criticised", r.topPainTheme ? t(labelOf(THEMES, r.topPainTheme)) : ND],
      ],
    },
    {
      title: "Acquisition & audience",
      items: [
        ["Top channel group", r.topChannelGroup ? `${t(labelOf(CHANNEL_GROUPS, r.topChannelGroup))} · ${pct(r.topChannelShare)}` : ND],
        ["Top channel", r.topChannel ? `${r.topChannel} · ${pct(r.topChannelOwnShare)}` : ND],
        ["Channel concentration", r.concentrationLevel ? `${t(labelOf(CONCENTRATION, r.concentrationLevel))} · HHI ${fmtNumber(r.hhiGroups ?? 0, 2)}` : ND],
        ["Peak day", r.peakDayShare === null ? ND : (r.isBursty ? t("{pct} of registrations · bursty campaign", { pct: pct(r.peakDayShare) }) : t("{pct} of registrations · even campaign", { pct: pct(r.peakDayShare) }))],
        ["Top university", r.topUniversityName ? `${r.topUniversityName} · ${pct(r.topUniversityShare)}` : ND],
        ["New to AIESEC", pct(r.newToOrgShare)],
        ["Want an internship", pct(r.internshipShare)],
        ["Average age", fm(r.avgAge, { unit: "years", decimals: 1 })],
        ["Duplicate rate", pct(r.duplicateRate, 1)],
      ],
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={t("Projects")}
        title={project.name}
        subtitle={[project.type.name, t(STATUS_LABEL[project.status]), fmtDate(r.startDate, lang), project.city, project.ownerTeam].filter(Boolean).join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            {campaign && <Link href={`/campaigns/${campaign.id}`} className="btn-primary">{t("Campaign & UTM links")} →</Link>}
            <Link href={`/projects?${similarQuery(project.type.key, r.registrants)}`} className="btn-ghost">{t("Similar projects")} →</Link>
            <Link href="/projects" className="btn-ghost">← {t("All projects")}</Link>
          </div>
        }
      />

      {small && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-accent">
          {t("Few feedback responses")} <SmallSample n={r.responses!} /> — {t("this project's scores may be noise.")}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {groups.map((g) => (
          <section key={g.title} className="card p-5">
            <h2 className="mb-3 font-display text-base font-semibold">{t(g.title)}</h2>
            <dl className="divide-y divide-line text-sm">
              {g.items.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2">
                  <dt className="text-ink-muted">{t(k)}</dt>
                  <dd className={v === ND ? "text-right text-ink-faint" : "num text-right text-ink"}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-3 font-display text-base font-semibold">{t("Project reports")}</h2>
        {project.reports.length === 0 ? (
          <p className="text-sm text-ink-faint">
            {t("No reports yet. Upload one in")} <Link href="/reports" className="text-accent hover:underline">{t("Reports")}</Link> {t("and choose this project.")}
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {project.reports.map((rep) => (
              <li key={rep.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/reports/${rep.id}`} className="font-medium text-ink hover:text-accent">{rep.title}</Link>
                <span className="text-xs text-ink-faint">
                  {rep.type === "feedback" ? t("Feedback") : t("Registration")} · {rep.status === "published" ? t("published") : t("draft")} · {formatDateTime(rep.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {project.metrics && <p className="mt-3 text-xs text-ink-faint">{t("Metrics recomputed {date} (formula version {v}).", { date: formatDateTime(project.metrics.computedAt), v: project.metrics.metricsVersion })}</p>}
      </section>

      {admin && (
      <details className="card mt-6 p-5">
        <summary className="cursor-pointer font-display text-base font-semibold">{t("Edit project")}</summary>
        <div className="mt-4">
          <ProjectForm
            types={types.map((x) => ({ value: x.key, label: x.name }))}
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
      )}
    </>
  );
}
