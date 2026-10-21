"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/**
 * Rename a form for the team, in place. Empty goes back to the name taken
 * from the page (the form's heading or the page title).
 */
export function FormRename({ id, name, autoName, className }: { id: string; name: string; autoName: string; className?: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/forms/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customTitle: next.trim() || null }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(body.error ?? t("Could not rename"));
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        title={t("Rename")}
        aria-label={t("Rename the form")}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setValue(name); setOpen(true); }}
        className={cn("rounded-lg p-1.5 text-ink-faint transition hover:bg-bg-hover hover:text-ink", className)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void save(value); }}
      onClick={(e) => e.stopPropagation()}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <input
        autoFocus
        className="input min-w-[220px] flex-1 py-1.5 text-sm"
        value={value}
        maxLength={120}
        placeholder={autoName}
        aria-label={t("Form name")}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <button type="submit" className="btn-primary py-1.5 text-sm" disabled={busy}>{busy ? t("Saving…") : t("Save")}</button>
      <button type="button" className="btn-ghost py-1.5 text-sm" onClick={() => setOpen(false)}>{t("Cancel")}</button>
      {name !== autoName && (
        <button type="button" className="text-xs text-ink-faint hover:text-ink" disabled={busy} onClick={() => void save("")} title={t("Back to «{name}»", { name: autoName })}>
          {t("Use the page's name")}
        </button>
      )}
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}
