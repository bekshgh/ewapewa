"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { formatNumber, formatPercent } from "@/lib/utils";

const COLORS = [
  "#4f8ef7", "#22c55e", "#f59e0b", "#ef4444", "#a78bfa",
  "#06b6d4", "#f97316", "#ec4899", "#10b981", "#64748b",
];

const axis = { stroke: "#6b6b76", fontSize: 11, tickLine: false };

/* ─── Line chart ─────────────────────────────────────── */
export function ClicksLeadsChart({ data }: { data: { date: string; clicks: number; leads: number }[] }) {
  const t = useT();
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="#26262e" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6b6b76", fontSize: 11 }}
            axisLine={{ stroke: "#26262e" }}
            tickLine={false}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={28}
          />
          <YAxis tick={{ fill: "#6b6b76", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{ background: "#16161b", border: "1px solid #26262e", borderRadius: 12, fontSize: 12, color: "#f4f4f5" }}
            labelStyle={{ color: "#a1a1aa" }}
          />
          <Line type="monotone" dataKey="clicks" stroke="#5b9bff" strokeWidth={2.5} dot={false} name={t("Clicks")} />
          <Line type="monotone" dataKey="leads" stroke="#3ecf8e" strokeWidth={2.5} dot={false} name={t("Leads")} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-ink-muted">
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-clicks" />{t("Clicks")}</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-leads" />{t("Leads")}</span>
      </div>
    </div>
  );
}

/* ─── Donut chart ────────────────────────────────────── */
type Row = { key: string; clicks: number; leads: number; cr: number };

function DonutChart({ data, field }: { data: { name: string; value: number }[]; field: "Clicks" | "Leads" }) {
  const t = useT();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 text-xs font-medium text-ink-muted uppercase tracking-wide">{t(field)}</p>
      <div className="h-[180px] w-full max-w-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#16161b", border: "1px solid #26262e", borderRadius: 10, fontSize: 11, color: "#f4f4f5" }}
              formatter={(v: number, name: string) => [`${v} (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`, `${name} · ${t(field)}`]}
              labelStyle={{ color: "#e4e4e7" }}
              itemStyle={{ color: "#f4f4f5" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* legend */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.slice(0, 7).map((d, i) => (
          <span key={d.name} className="flex items-center gap-1 text-[11px] text-ink-muted">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Breakdown panel (donuts + table) ──────────────── */
const ROW_LIMITS = [10, 20, 30, 0] as const; // 0 = all

export function BreakdownPanel({ title, head, rows }: { title: string; head: string; rows: Row[] }) {
  const t = useT();
  const [limit, setLimit] = useState<number>(10);
  const shown = limit ? rows.slice(0, limit) : rows;
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalLeads  = rows.reduce((s, r) => s + r.leads,  0);

  const clicksData = rows.slice(0, 8).map((r) => ({ name: r.key, value: r.clicks }));
  const leadsData  = rows.slice(0, 8).map((r) => ({ name: r.key, value: r.leads  }));

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {rows.length > ROW_LIMITS[0] && (
          <div className="inline-flex rounded-lg border border-line p-0.5 text-xs" role="group" aria-label={t("Rows shown")}>
            {ROW_LIMITS.filter((n) => n === 0 || n < rows.length || n === ROW_LIMITS[0]).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLimit(n)}
                aria-pressed={limit === n}
                className={`rounded-md px-2.5 py-1 transition ${limit === n ? "bg-bg-hover font-medium text-ink" : "text-ink-faint hover:text-ink"}`}
              >
                {n === 0 ? t("All {n}", { n: rows.length }) : t("Top {n}", { n })}
              </button>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink-faint">{t("No data yet.")}</p>
      ) : (
        <>
          {/* donuts */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <DonutChart data={clicksData} field="Clicks" />
            <DonutChart data={leadsData}  field="Leads"  />
          </div>

          {/* table */}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 font-medium">{head}</th>
                  <th className="pb-2 text-right font-medium">{t("Clicks")}</th>
                  <th className="pb-2 text-right font-medium">{t("% clicks")}</th>
                  <th className="pb-2 text-right font-medium">{t("Leads")}</th>
                  <th className="pb-2 text-right font-medium">{t("% leads")}</th>
                  <th className="pb-2 text-right font-medium">CR%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r, i) => (
                  <tr key={r.key} className="hover:bg-bg-hover/40">
                    <td className="py-2.5 flex items-center gap-2 text-ink">
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      {r.key}
                    </td>
                    <td className="num py-2.5 text-right text-ink-muted">{formatNumber(r.clicks)}</td>
                    <td className="num py-2.5 text-right text-ink-muted">
                      {totalClicks > 0 ? `${((r.clicks / totalClicks) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="num py-2.5 text-right text-leads">{formatNumber(r.leads)}</td>
                    <td className="num py-2.5 text-right text-ink-muted">
                      {totalLeads > 0 ? `${((r.leads / totalLeads) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="num py-2.5 text-right font-medium text-ink">
                      {r.clicks ? `${r.cr.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
