import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <div className="num text-6xl font-bold text-accent">404</div>
      <h1 className="mt-4 font-display text-2xl font-bold">{t("Page not found")}</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">
        {t("This page doesn't exist. If you followed a short link, it may have been archived or deleted.")}
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        {t("Back to dashboard")}
      </Link>
    </div>
  );
}
