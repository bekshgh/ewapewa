import type { InputState } from "@/lib/conversions/state";
import { ru } from "./api";

const ORDER = ["projectRegs", "showUp", "regOgx", "aiesecOrgSignup"] as const;

/**
 * The four numbers side by side with bars. Not a funnel: the numbers need not
 * shrink from one to the next, so nothing here talks about "losses".
 */
export function NumbersScheme({ inputs }: { inputs: Record<string, InputState> }) {
  const max = Math.max(1, ...ORDER.map((k) => inputs[k]?.value ?? 0));
  return (
    <ol className="grid gap-3 sm:grid-cols-4" aria-label="Входные числа">
      {ORDER.map((k, i) => {
        const s = inputs[k];
        const v = s?.value ?? null;
        return (
          <li key={k} className="flex items-center gap-2 sm:block">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-ink-muted">{s?.label}</span>
                <span className={`num text-sm ${v === null ? "text-ink-faint" : "text-ink"}`}>{v === null ? "нет данных" : `${ru(v)} чел.`}</span>
              </div>
              <div
                className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-bg-raised"
                role="img"
                aria-label={`${s?.label}: ${v === null ? "нет данных" : `${v} человек`}`}
              >
                {v !== null && <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />}
              </div>
            </div>
            {i < ORDER.length - 1 && <span aria-hidden className="text-ink-faint sm:hidden">·</span>}
          </li>
        );
      })}
    </ol>
  );
}
