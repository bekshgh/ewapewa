import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EMPTY_PROJECT, ProjectForm } from "@/components/projects/ProjectForm";
import { prisma } from "@/lib/db";
import { AccessDenied } from "@/components/AccessDenied";
import { currentActor } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  if (!isAdmin(await currentActor())) return <AccessDenied />;
  const t = await getT();
  const types = await prisma.projectType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return (
    <>
      <PageHeader breadcrumb={t("Projects")} title={t("New project")} action={<Link href="/projects" className="btn-ghost">← {t("All projects")}</Link>} />
      <section className="card max-w-3xl p-6">
        <ProjectForm initial={EMPTY_PROJECT} types={types.map((x) => ({ value: x.key, label: x.name }))} />
      </section>
    </>
  );
}
