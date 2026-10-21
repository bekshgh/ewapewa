"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

const styles: Record<string, string> = {
  exact: "bg-leads/12 text-leads",
  estimated: "bg-accent/12 text-accent",
  unknown: "bg-ink-faint/15 text-ink-muted",
  active: "bg-leads/12 text-leads",
  paused: "bg-accent/12 text-accent",
  archived: "bg-ink-faint/15 text-ink-muted",
  success: "bg-leads/12 text-leads",
  failed: "bg-danger/12 text-danger",
  unauthorized: "bg-danger/12 text-danger",
  missing_click_id: "bg-accent/12 text-accent",
  duplicated: "bg-ink-faint/15 text-ink-muted",
  default: "bg-bg-hover text-ink-muted",
};

/** A status word: translated when the dictionary knows it (active, paused, exact, draft…). */
export function Pill({ label, tone = "default" }: { label: string; tone?: string }) {
  const t = useT();
  return <span className={cn("pill", styles[tone] || styles.default)}>{t(label)}</span>;
}
