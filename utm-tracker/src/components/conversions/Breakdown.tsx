import type { Breakdown as B } from "@/lib/conversions/quality";
import { ru } from "./api";

/** "629 записей → −3 без email → −26 дублей → −4 карантин → итог 596", plus what is pending. */
export function breakdownText(b: B): string {
  const parts = [`${ru(b.raw)} записей`];
  if (b.invalid) parts.push(`−${ru(b.invalid)} без email`);
  parts.push(`−${ru(b.duplicates)} дублей`);
  parts.push(`−${ru(b.quarantined)} карантин`);
  if (b.rejected) parts.push(`−${ru(b.rejected)} фейк`);
  if (b.suspiciousExcluded) parts.push(`−${ru(b.suspiciousExcluded)} на проверке (не учтены)`);
  parts.push(`итог ${ru(b.total)}`);
  return parts.join(" → ");
}

export function BreakdownLine({ b }: { b: B }) {
  return (
    <div className="space-y-0.5 text-xs">
      <p className="num text-ink-muted">{breakdownText(b)}</p>
      <p className="text-ink-faint">
        {b.pending > 0 && !b.suspiciousExcluded && <>из них на проверке: {ru(b.pending)} · </>}
        строго (только проверенные): <span className="num text-ink-muted">{ru(b.strict)}</span>
      </p>
    </div>
  );
}
