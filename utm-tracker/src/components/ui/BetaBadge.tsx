"use client";

import { useT } from "@/lib/i18n/client";

/** «Beta» mark for features that are still being tried out (amber, unlike the blue «New»). */
export function BetaBadge({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <span className={`inline-flex items-center rounded-full bg-amber-400/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase leading-none tracking-wide text-amber-300 ring-1 ring-amber-400/30 ${className}`}>
      {t("Beta")}
    </span>
  );
}
