import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectsExplorer } from "@/components/projects/ProjectsExplorer";
import { prisma } from "@/lib/db";
import { queryProjects } from "@/lib/projects/query";
import { currentActor } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  const t = await getT();
  const admin = isAdmin(await currentActor());
  const [{ state, result, types, rows }, views] = await Promise.all([
    queryProjects(prisma, searchParams, { admin: true }),
    prisma.savedView.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, query: true } }),
  ]);
  const compareRows = state.cmp.map((slug) => rows.find((r) => r.slug === slug)).filter((r): r is NonNullable<typeof r> => Boolean(r));

  return (
    <>
      <PageHeader
        breadcrumb={t("Projects")}
        title={t("Projects")}
        subtitle={t("Find a project, compare like with like, see what works and where it hurts.")}
        action={admin ? <Link href="/projects/new" className="btn-primary">+ {t("New project")}</Link> : undefined}
      />
      <ProjectsExplorer state={state} result={result} types={types} views={views} compareRows={compareRows} />
    </>
  );
}
