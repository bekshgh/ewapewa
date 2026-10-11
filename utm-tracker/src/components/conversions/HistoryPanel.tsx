"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatFraction, formatShare } from "@/lib/conversions/compute";
import { ru } from "./api";

export type Snapshot = {
  id: string;
  asOfDate: string;
  createdBy: string;
  note: string | null;
  inputs: Record<"projectRegs" | "showUp" | "regOgx" | "aiesecOrgSignup", number | null>;
  ratios: { key: string; label: string; value: number | null; num: number | null; den: number | null }[];
};

/** The two headline ratios over time; both are distinguishable by dash as well as colour. */
const MAIN = [
  { key: "ogx_per_regs", color: "#f6b352", dash: undefined },
  { key: "signup_per_regs", color: "#5b9bff", dash: "5 4" },
];

export function HistoryPanel({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length === 0) return <p className="text-sm text-ink-faint">Снимков пока нет. Нажмите «Зафиксировать снимок», чтобы сохранить текущие числа в историю.</p>;
  const chron = [...snapshots].reverse();
  const data = chron.map((s) => ({
    date: s.asOfDate,
    ...Object.fromEntries(s.ratios.map((r) => [r.key, r.value === null ? null : Math.round(r.value * 1000) / 10])),
  }));
  const labels = Object.fromEntries(snapshots[0].ratios.map((r) => [r.key, r.label]));
  return (
    <div className="space-y-4">
      {snapshots.length > 1 && (
        <div className="h-[220px] w-full" role="img" aria-label={`Динамика: ${MAIN.map((m) => labels[m.key]).join(" и ")} по датам снимков, в процентах`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="#26262e" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#6b6b76", fontSize: 11 }} axisLine={{ stroke: "#26262e" }} tickLine={false} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fill: "#6b6b76", fontSize: 11 }} axisLine={false} tickLine={false} width={44} unit="%" />
              <Tooltip
                contentStyle={{ background: "#16161b", border: "1px solid #26262e", borderRadius: 12, fontSize: 12 }}
                formatter={(v, name) => [v === null ? "нет данных" : `${String(v).replace(".", ",")}%`, labels[String(name)] ?? String(name)]}
              />
              <Legend formatter={(v: string) => <span className="text-xs text-ink-muted">{labels[v] ?? v}</span>} />
              {MAIN.map((m) => (
                <Line key={m.key} type="monotone" dataKey={m.key} stroke={m.color} strokeDasharray={m.dash} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">История снимков</caption>
          <thead>
            <tr className="text-left text-xs text-ink-faint">
              <th scope="col" className="py-1.5 font-normal">Дата</th>
              <th scope="col" className="py-1.5 text-right font-normal">Реги</th>
              <th scope="col" className="py-1.5 text-right font-normal">Шоуап</th>
              <th scope="col" className="py-1.5 text-right font-normal">Рега oGX</th>
              <th scope="col" className="py-1.5 text-right font-normal">Signup</th>
              {snapshots[0].ratios.map((r) => <th key={r.key} scope="col" className="py-1.5 text-right font-normal" title={r.label}>{r.label.replace(" / ", "/")}</th>)}
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id} className="border-t border-line align-top">
                <td className="py-1.5">
                  <span className="num text-ink">{s.asOfDate}</span>
                  {s.note && <p className="text-xs text-ink-faint">{s.note}</p>}
                </td>
                {(["projectRegs", "showUp", "regOgx", "aiesecOrgSignup"] as const).map((k) => <td key={k} className="num py-1.5 text-right text-ink-muted">{ru(s.inputs[k])}</td>)}
                {s.ratios.map((r) => (
                  <td key={r.key} className="num py-1.5 text-right" title={formatFraction(r.num, r.den)}>
                    {r.value === null ? <span className="text-ink-faint">—</span> : formatShare(r.value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
