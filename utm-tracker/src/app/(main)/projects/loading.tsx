import { getT } from "@/lib/i18n/server";

export default async function Loading() {
  const t = await getT();
  return (
    <div className="animate-pulse" aria-busy="true" aria-label={t("Loading projects")}>
      <div className="mb-8 h-10 w-48 rounded-lg bg-bg-raised" />
      <div className="flex flex-wrap gap-2">
        <div className="h-10 min-w-[220px] flex-1 rounded-full bg-bg-raised" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-10 w-24 rounded-full bg-bg-raised" />
        ))}
      </div>
      <div className="mt-4 h-7 w-2/3 rounded-full bg-bg-raised" />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-52 rounded-2xl bg-bg-raised" />
        ))}
      </div>
    </div>
  );
}
