import { formatFraction, formatShare, type RatioResult } from "@/lib/conversions/compute";

/** One card per ratio: big percentage, the fraction, the formula; badges carry text, not just colour. */
export function RatioCards({ ratios }: { ratios: RatioResult[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Коэффициенты EwA2oGX">
      {ratios.map((r) => (
        <li key={r.key} className="card flex flex-col gap-2 p-4">
          <p className="text-xs leading-snug text-ink-muted">{r.label}</p>
          {r.value === null ? (
            <>
              <p className="font-display text-2xl font-semibold text-ink-faint">нет данных</p>
              <p className="text-xs text-ink-faint">Не хватает: {r.missing.join(", ")}</p>
            </>
          ) : (
            <>
              <p className="num font-display text-3xl font-semibold text-ink">{formatShare(r.value)}</p>
              <p className="num text-sm text-ink-muted">{formatFraction(r.num, r.den)}</p>
            </>
          )}
          {(r.smallBase || r.over100) && (
            <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
              {r.smallBase && <span className="pill border border-line text-ink-muted">◔ малая база</span>}
              {r.over100 && <span className="pill border border-danger/50 text-danger">⚠ больше 100%: проверьте данные</span>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
