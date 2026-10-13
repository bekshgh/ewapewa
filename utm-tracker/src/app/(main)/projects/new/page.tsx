import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EMPTY_PROJECT, ProjectForm } from "@/components/projects/ProjectForm";
import { prisma } from "@/lib/db";
import { AccessDenied } from "@/components/AccessDenied";
import { currentActor } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  if (!isAdmin(await currentActor())) return <AccessDenied />;
  const types = await prisma.projectType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return (
    <>
      <PageHeader breadcrumb="Projects" title="New project" action={<Link href="/projects" className="btn-ghost">← All projects</Link>} />
      <section className="card max-w-3xl p-6">
        <ProjectForm initial={EMPTY_PROJECT} types={types.map((t) => ({ value: t.key, label: t.name }))} />
      </section>
    </>
  );
}
