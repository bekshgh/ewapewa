"use client";

import { useT } from "@/lib/i18n/client";

/**
 * «New» mark next to features added recently. It hides by itself after
 * NEW_UNTIL, so nobody has to come back and remove it.
 */
export const NEW_UNTIL = "2026-11-15";

export function isNewNow(now = new Date()): boolean {
  return now < new Date(`${NEW_UNTIL}T00:00:00+05:00`);
}

export function NewBadge({ className = "" }: { className?: string }) {
  const t = useT();
  if (!isNewNow()) return null;
  return (
    <span className={`inline-flex items-center rounded-full bg-accent px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase leading-none tracking-wide text-bg-base ${className}`}>
      {t("New")}
    </span>
  );
}
