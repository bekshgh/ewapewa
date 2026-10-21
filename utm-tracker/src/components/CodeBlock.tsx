"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-bg-base">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="text-xs uppercase tracking-wide text-ink-faint">{label || t("code")}</span>
        <button
          className="text-xs font-medium text-ink-faint hover:text-accent"
          onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        >
          {copied ? `${t("Copied")} ✓` : t("Copy")}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-ink-muted">{code}</pre>
    </div>
  );
}
