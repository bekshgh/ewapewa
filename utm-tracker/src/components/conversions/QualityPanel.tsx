import Link from "next/link";
import type { ConversionState } from "@/lib/conversions/state";
import { ru } from "./api";
import { BreakdownLine } from "./Breakdown";

export function QualityPanel({ state, reviewHref }: { state: ConversionState; reviewHref: string }) {
  const sources = (["projectRegs", "regOgx"] as const).map((k) => state.inputs[k]).filter((s) => s.breakdown);
  const pending = sources.reduce((n, s) => n + (s.breakdown!.pending ?? 0) + (s.breakdown!.quarantined ?? 0), 0);
  return (
    <div className="space-y-3">
      {sources.length === 0 ? (
        <p className="text-sm text-ink-faint">Проверка работает, когда подключены таблица регистраций или oGX-кампания.</p>
      ) : (
        <ul className="space-y-3">
          {sources.map((s) => (
            <li key={s.key}>
              <p className="text-sm text-ink">{s.label}</p>
              <BreakdownLine b={s.breakdown!} />
            </li>
          ))}
        </ul>
      )}
      <Link href={reviewHref} className="btn-ghost inline-flex border border-line text-sm">
        Очередь проверки{pending ? ` · ${ru(pending)}` : ""} →
      </Link>
    </div>
  );
}
