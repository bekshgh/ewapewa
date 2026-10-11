import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReviewQueue } from "@/components/conversions/ReviewQueue";
import { prisma } from "@/lib/db";
import { reviewQueue } from "@/lib/conversions/actions";

export const dynamic = "force-dynamic";

/** Suspicious and quarantined records of a project's conversion sources (admin only, like all project pages). */
export default async function ReviewPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!project) notFound();
  const items = await reviewQueue(prisma, project.id);
  return (
    <>
      <PageHeader
        breadcrumb="Projects"
        title="Очередь проверки"
        subtitle={`${project.name} · Конверсия (EwA2ELD): подозрительные записи и карантин. Решения обратимы, записи не удаляются.`}
        action={<Link href={`/projects/${slug}`} className="btn-ghost">← К проекту</Link>}
      />
      <ReviewQueue projectId={project.id} initial={items} />
    </>
  );
}
