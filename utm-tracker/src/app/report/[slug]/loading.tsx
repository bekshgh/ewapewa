import { getT } from "@/lib/i18n/server";

export default async function Loading() {
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-[1180px] animate-pulse px-4 py-6 sm:px-8 sm:py-10" aria-busy="true" aria-label={t("Loading report")}>
      <div className="mb-3 flex gap-2">
        <div className="h-6 w-20 rounded-full bg-bg-raised" />
        <div className="h-6 w-28 rounded-full bg-bg-raised" />
      </div>
      <div className="h-9 w-2/3 rounded-lg bg-bg-raised" />
      <div className="mt-3 h-4 w-1/2 rounded bg-bg-raised" />
      <div className="mt-8 h-10 w-full max-w-xl rounded-full bg-bg-raised" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-28 rounded-xl bg-bg-raised" />
        ))}
      </div>
      <div className="mt-6 h-72 rounded-2xl bg-bg-raised" />
    </main>
  );
}
