import { PageHeader } from "@/components/ui/PageHeader";
import { getLang, getT } from "@/lib/i18n/server";
import * as en from "./en";
import * as ru from "./ru";

export const metadata = { title: "Guideline — EwA Tracker" };

export default async function GuidePage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const g = lang === "ru" ? ru : en;
  return (
    <>
      <PageHeader breadcrumb={t("Guideline")} title={t("Beginner's guide")} subtitle={t("Step by step, in plain words: from your first link to reading the analytics.")} />

      <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
        {/* nav */}
        <nav className="hidden lg:block lg:sticky lg:top-8 lg:self-start">
          <p className="mb-3 text-xs uppercase tracking-wide text-ink-faint">{t("Contents")}</p>
          <ol className="space-y-1 text-sm">
            {g.SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-lg px-2 py-1 text-ink-muted transition hover:bg-bg-raised hover:text-ink">
                  <span className="text-ink-faint">{s.n}.</span> {s.t}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* content */}
        <article className="max-w-2xl">
          <g.Body />
        </article>
      </div>
    </>
  );
}
