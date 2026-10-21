import { PageHeader } from "@/components/ui/PageHeader";
import { getT } from "@/lib/i18n/server";

export async function AccessDenied({ title }: { title?: string }) {
  const t = await getT();
  return (
    <>
      <PageHeader breadcrumb={t("Access")} title={title ?? t("Admins only")} subtitle={t("Your role does not open this page. Ask an admin if you need it.")} />
    </>
  );
}
