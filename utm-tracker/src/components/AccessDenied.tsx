import { PageHeader } from "@/components/ui/PageHeader";

export function AccessDenied({ title = "Admins only" }: { title?: string }) {
  return (
    <>
      <PageHeader breadcrumb="Access" title={title} subtitle="Your role does not open this page. Ask an admin if you need it." />
    </>
  );
}
