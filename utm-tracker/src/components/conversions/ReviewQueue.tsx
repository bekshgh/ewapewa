"use client";

import { useMemo, useState } from "react";
import type { QueueItem } from "@/lib/conversions/actions";
import { call } from "./api";

const FLAG_LABEL: Record<string, string> = {
  invalid_email_format: "кривой email",
  disposable_email: "одноразовая почта",
  no_mx: "домен не принимает почту",
  test_words: "тестовые слова",
  gibberish_name_or_email: "бессмысленный набор букв",
  placeholder_phone: "фиктивный телефон",
  burst: "всплеск в одну минуту",
  missing_utm: "нет UTM",
  possible_duplicate: "тот же телефон, другой email",
};
const STATUS_LABEL = { valid: "норма", suspicious: "на проверке", quarantined: "карантин" } as const;
const SOURCE_LABEL = { sheet: "Реги на проект (таблица)", ogx: "Рега oGX (заявки)" } as const;

export function ReviewQueue({ projectId, initial }: { projectId: string; initial: QueueItem[] }) {
  const [items, setItems] = useState(initial);
  const [source, setSource] = useState<"sheet" | "ogx">(initial.some((i) => i.source === "sheet") || !initial.length ? "sheet" : "ogx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = items.filter((i) => i.source === source);
  const flagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of list) if (!i.decision) for (const f of i.flags) m.set(f, (m.get(f) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [list]);

  async function act(body: { keys?: string[]; flag?: string; decision: "approved" | "rejected" | null }) {
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ items: QueueItem[] }>(`/api/projects/${projectId}/conversion/review`, { method: "POST", body: JSON.stringify({ source, ...body }) });
      setItems(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Источник" className="flex flex-wrap gap-2">
        {(["sheet", "ogx"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={source === s} className={`rounded-xl px-4 py-1.5 text-sm transition ${source === s ? "bg-accent text-black" : "bg-bg-raised text-ink-muted hover:text-ink"}`} onClick={() => setSource(s)}>
            {SOURCE_LABEL[s]} · {items.filter((i) => i.source === s).length}
          </button>
        ))}
      </div>

      {flagCounts.length > 0 && (
        <div className="card space-y-2 p-4">
          <p className="text-xs text-ink-muted">Массово по причине:</p>
          <ul className="flex flex-col gap-2">
            {flagCounts.map(([f, n]) => (
              <li key={f} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-[14rem] text-ink">{FLAG_LABEL[f] ?? f} · {n}</span>
                <button className="btn-ghost border border-line text-xs" disabled={busy} onClick={() => act({ flag: f, decision: "approved" })}>✓ Все настоящие</button>
                <button className="btn-ghost border border-line text-xs hover:border-danger hover:text-danger" disabled={busy} onClick={() => act({ flag: f, decision: "rejected" })}>✕ Все фейк</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">✕ {error}</p>}

      {list.length === 0 ? (
        <p className="text-sm text-ink-faint">Подозрительных записей нет.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((i) => (
            <li key={i.key} className="card flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="break-all text-sm text-ink">{i.label}{i.detail ? <span className="text-ink-muted"> · {i.detail}</span> : null}</p>
                <p className="text-xs text-ink-faint">
                  {i.ref ? `${i.source === "sheet" ? i.ref.replace("row", "строка") : "заявка"} · ` : ""}риск {i.riskScore}/100 · {STATUS_LABEL[i.status]}
                  {i.decision && <> · решение: <span className={i.decision === "approved" ? "text-leads" : "text-danger"}>{i.decision === "approved" ? "✓ настоящий" : "✕ фейк"}</span>{i.decidedBy ? ` (${i.decidedBy}, ${new Date(i.decidedAt!).toLocaleString("ru-RU")})` : ""}</>}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {i.flags.map((f) => <li key={f} className="pill border border-line text-ink-muted">{FLAG_LABEL[f] ?? f}</li>)}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                {i.decision ? (
                  <button className="btn-ghost border border-line text-xs" disabled={busy} onClick={() => act({ keys: [i.key], decision: null })}>
                    ↺ Отменить решение
                  </button>
                ) : (
                  <>
                    <button className="btn-ghost border border-line text-xs" disabled={busy} onClick={() => act({ keys: [i.key], decision: "approved" })}>
                      ✓ {i.status === "quarantined" ? "Вернуть из карантина" : "Подтвердить"}
                    </button>
                    <button className="btn-ghost border border-line text-xs hover:border-danger hover:text-danger" disabled={busy} onClick={() => act({ keys: [i.key], decision: "rejected" })}>
                      ✕ Отметить фейком
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
