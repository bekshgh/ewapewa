"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

const OPTIONS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

export function RangeTabs({ current }: { current: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const select = (value: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("range", value);
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <div className="inline-flex rounded-full border border-line bg-bg-raised p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => select(o.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm transition",
            current === o.value ? "bg-bg-hover font-medium text-ink" : "text-ink-muted hover:text-ink"
          )}
        >
          {t(o.label)}
        </button>
      ))}
    </div>
  );
}
