"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { plural, type Lang, type T } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/client";
import type { ForecastSummary, Group, Person } from "@/lib/attendanceForecast/summary";

/** Results of the attendance forecast (beta): the same view for the site's data and an uploaded sheet. */

const locale = (lang: Lang) => (lang === "ru" ? "ru-RU" : "en-GB");
const useFmt = () => {
  const lang = useLang();
  const loc = locale(lang);
  return {
    lang,
    num: (n: number) => Math.round(n).toLocaleString(loc),
    pct: (p: number) => `${Math.round(p * 100)}%`,
    /** "YYYY-MM-DD" → "9 Nov" */
    day: (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(loc, { day: "numeric", month: "short" }); },
  };
};

/** Segment and status keys come from the data; the few fixed ones are translated. */
const groupName = (t: T, key: string) =>
  key === "Без сегмента" ? t("No segment") : ["In a team", "Solo", "Looking for a team", "All"].includes(key) ? t(key) : key;

export function ForecastView({ s, admin }: { s: ForecastSummary; admin: boolean }) {
  const t = useT();
  return (
    <div className="space-y-6">
      <Tiles s={s} />
      <DailyChart s={s} />
      <Groups s={s} />
      {admin && s.people && <People people={s.people} />}
    </div>
  );
}

function Tile({ label, value, range, note, bar, tone }: { label: string; value: string; range?: React.ReactNode; note?: string; bar?: number; tone?: "leads" | "accent" | "danger" }) {
  return (
    <div className="card flex flex-col p-5">
      <div className="text-sm text-ink-muted">{label}</div>
      <div className={cn("num mt-3 text-4xl font-bold tracking-tight", tone === "leads" ? "text-leads" : tone === "danger" ? "text-danger" : "text-ink")}>{value}</div>
      {range && <div className="mt-1 text-sm text-ink-muted">{range}</div>}
      {bar !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-hover">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, bar * 100))}%` }} />
        </div>
      )}
      {note && <p className="mt-3 text-xs leading-relaxed text-ink-faint">{note}</p>}
    </div>
  );
}

function Tiles({ s }: { s: ForecastSummary }) {
  const t = useT();
  const { num, pct, day, lang } = useFmt();
  const r = s.registrations;
  const left = r.daysLeft + 1;
  const a = s.attendance;
  const p = s.plan;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {r.closed ? (
        <Tile label={t("Registrations by the deadline")} value={num(r.current)} range={t("Registration closed")}
          note={t("The deadline {date} has passed: {n} registrations in the end.", { date: day(s.deadline), n: num(r.current) })} bar={1} />
      ) : (
        <Tile
          label={t("Registrations by the deadline")}
          value={num(r.mid)}
          range={<>{t("from")} <b className="num text-ink">{num(r.low)}</b> {t("to")} <b className="num text-ink">{num(r.high)}</b></>}
          bar={r.mid ? r.current / r.mid : 0}
          note={t("Now {n}; {days} left until the deadline {date}. Usual pace: {pace} a day.", {
            n: num(r.current), date: day(s.deadline), pace: num(r.pacePerDay),
            days: `${left} ${plural(lang, left, "день", "дня", "дней", "day", "days")}`,
          })}
        />
      )}
      <Tile
        label={t("Will come of those registered so far")}
        value={num(a.mean)}
        tone="leads"
        range={<>{t("from")} <b className="num text-ink">{num(a.low)}</b> {t("to")} <b className="num text-ink">{num(a.high)}</b> · {t("turnout {p}", { p: pct(a.rate) })}</>}
        note={s.atDeadline !== null
          ? t("If all {n} are invited. By the deadline, with ~{final} registrations, it would be about {come}.", { n: num(a.n), final: num(r.mid), come: num(s.atDeadline) })
          : t("If all {n} are invited.", { n: num(a.n) })}
      />
      {p.reached ? (
        <Tile
          label={t("Invite to get {n} people", { n: num(p.target) })}
          value={num(p.invite)}
          tone="accent"
          range={<>{t("will come ≈")} <b className="num text-ink">{num(p.mean)}</b> ({t("from")} {num(p.low)} {t("to")} {num(p.high)})</>}
          note={s.useSegments
            ? p.bySegment.map((x) => `${groupName(t, x.key)}: ${num(x.n)}`).join(" · ")
            : t("The likeliest by the model, segments not taken into account.")}
        />
      ) : (
        <Tile
          label={t("Invite to get {n} people", { n: num(p.target) })}
          value={t("Not enough")}
          tone="danger"
          range={<>{t("even all {n} give ≈", { n: num(a.n) })} <b className="num text-ink">{num(a.mean)}</b></>}
          note={t("More registrations or a smaller target are needed.")}
        />
      )}
    </div>
  );
}

/** Actual bars, the base forecast stacked on them (dashed), whiskers from the cautious to the high scenario. */
function DailyChart({ s }: { s: ForecastSummary }) {
  const t = useT();
  const { num, day } = useFmt();
  const bars = s.chart;
  if (!bars.length) return null;
  const W = 960, H = 280, L = 44, R = 12, T = 18, B = 34;
  let max = 1;
  for (const b of bars) max = Math.max(max, b.actual + (b.high ?? 0));
  const raw = max / 5, pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => raw <= x) ?? 10 * pow;
  max = Math.ceil(max / step) * step;
  const bw = (W - L - R) / bars.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const every = Math.ceil(bars.length / 14);
  const today = s.registrations.closed ? -1 : bars.findIndex((b) => b.daysLeft === s.registrations.daysLeft);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold">{t("Registrations by day")}</h2>
        <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />{t("Actual")}</span>
          {!s.registrations.closed && <>
            <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-accent bg-accent/25" />{t("Forecast (base)")}</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-0.5 bg-ink-faint" />{t("Range")}</span>
          </>}
        </div>
      </div>
      <div className="-mx-1 mt-4 overflow-x-auto px-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[620px]" role="img" aria-label={t("Registrations by day: actual and forecast up to the deadline")}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-faint text-[11px]">{v}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = L + i * bw, w = Math.max(2, bw * 0.72), x0 = x + (bw - w) / 2, cx = x + bw / 2;
          const label = b.daysLeft === 0 ? t("deadline") : day(b.day);
          return (
            <g key={b.day}>
              {b.actual > 0 && (
                <rect x={x0} y={y(b.actual)} width={w} height={y(0) - y(b.actual)} rx={2} className="fill-accent">
                  <title>{`${day(b.day)}: ${num(b.actual)}`}</title>
                </rect>
              )}
              {b.mid !== undefined && (
                <>
                  <rect x={x0} y={y(b.actual + b.mid)} width={w} height={Math.max(0, y(b.actual) - y(b.actual + b.mid))} rx={2} className="fill-accent/25 stroke-accent" strokeDasharray="3 2">
                    <title>{t("{date}: forecast +{n} (from {low} to {high})", { date: day(b.day), n: num(b.mid), low: num(b.low ?? 0), high: num(b.high ?? 0) })}</title>
                  </rect>
                  <line x1={cx} x2={cx} y1={y(b.actual + (b.low ?? 0))} y2={y(b.actual + (b.high ?? 0))} className="stroke-ink-faint" strokeWidth={1.5} />
                  <line x1={cx - 4} x2={cx + 4} y1={y(b.actual + (b.high ?? 0))} y2={y(b.actual + (b.high ?? 0))} className="stroke-ink-faint" strokeWidth={1.5} />
                </>
              )}
              {/* every few days, and the deadline (a regular label right before it would collide) */}
              {(b.daysLeft === 0 || (i % every === 0 && !(bars[bars.length - 1].daysLeft === 0 && bars.length - 1 - i < Math.max(2, every)))) && (
                <text x={cx} y={H - B + 18} textAnchor="middle" className={cn("text-[11px]", b.daysLeft === 0 ? "fill-ink font-medium" : "fill-ink-faint")}>{label}</text>
              )}
            </g>
          );
        })}
        {today >= 0 && (
          <g>
            <line x1={L + today * bw} x2={L + today * bw} y1={T} y2={y(0)} className="stroke-ink" strokeWidth={1} strokeDasharray="2 3" />
            <text x={L + today * bw + 4} y={T + 8} className="fill-ink text-[11px]">{t("today")}</text>
          </g>
        )}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="stroke-ink-faint" strokeWidth={1} />
      </svg>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        {s.registrations.closed
          ? t("Registration is closed: only the actual numbers are shown.")
          : t("Today's bar is not complete: the forecast shows how many more will come by the end of the day. The biggest jump is usually on the deadline day.")}
      </p>
    </section>
  );
}

function RateBar({ p }: { p: number }) {
  const { pct } = useFmt();
  const tone = p >= 0.6 ? "bg-leads" : p >= 0.4 ? "bg-amber-400" : "bg-danger";
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-bg-hover sm:inline-block"><i className={cn("block h-full rounded-full", tone)} style={{ width: `${p * 100}%` }} /></span>
      <span className="num w-10 text-right">{pct(p)}</span>
    </span>
  );
}

function Groups({ s }: { s: ForecastSummary }) {
  const t = useT();
  const { num, pct } = useFmt();
  const g = s.groups;
  const row = (x: Group, cls = "", name = groupName(t, x.key)) => (
    <tr key={x.key} className={cn("border-b border-line/60", cls)}>
      <td className="py-2 pr-3">{name}</td>
      <td className="num py-2 text-right">{num(x.n)}</td>
      <td className="num py-2 text-right text-leads">{num(x.mean)}</td>
      <td className="py-2 text-right">{cls ? <span className="num">{pct(x.rate)}</span> : <RateBar p={x.rate} />}</td>
    </tr>
  );
  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold">{g.by === "segment" ? t("Turnout by ICP segment") : t("Turnout by participation type")}</h2>
      {g.by === "status" && <p className="mt-1 text-xs text-ink-faint">{t("The data has no ICP segments (Screening column), so the plan picks the likeliest people.")}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="pb-2 font-medium">{g.by === "segment" ? t("Segment") : t("Participation")}</th>
              <th className="pb-2 text-right font-medium">{t("Registrations")}</th>
              <th className="pb-2 text-right font-medium">{t("Will come")}</th>
              <th className="pb-2 text-right font-medium">{t("Turnout")}</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((x) => row(x))}
            {row(g.total, "font-semibold")}
            {g.topTwo && row(g.topTwo, "text-ink-muted", t("If you invite P0 + P1"))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const LEVELS: { key: Person["level"]; label: string }[] = [
  { key: "high", label: "High ≥60%" },
  { key: "medium", label: "Medium 40–60%" },
  { key: "low", label: "Low <40%" },
];
const PAGE = 100;

function People({ people }: { people: Person[] }) {
  const t = useT();
  const { num, pct } = useFmt();
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState("");
  const [lvl, setLvl] = useState("");
  const [shown, setShown] = useState(PAGE);
  const segments = useMemo(() => [...new Set(people.map((p) => p.segment))], [people]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter((p) =>
      (!seg || p.segment === seg) && (!lvl || p.level === lvl) &&
      (!s || [p.name, p.email, p.telegram, p.team, p.university].some((v) => v?.toLowerCase().includes(s))));
  }, [people, q, seg, lvl]);

  function exportCsv() {
    const head = ["Name", "Email", "Telegram", "Phone", "Team", "University", "Year of study", "Segment", "Chance to come", "Registered"];
    const cell = (v: string | number | null) => { const x = v === null ? "" : String(v); return /[",;\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const lines = [head, ...list.map((p) => [p.name, p.email, p.telegram, p.phone, p.team, p.university, p.year, groupName(t, p.segment), pct(p.probability), p.createdAt])];
    const blob = new Blob(["﻿" + lines.map((l) => l.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "attendance-forecast.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold">{t("Participants and their chance to come")}</h2>
        <span className="text-xs text-ink-faint">{t("{n} of {total} · admins only", { n: num(list.length), total: num(people.length) })}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder={t("Search: name, team, university")} className="input max-w-xs flex-1" />
        <select value={seg} onChange={(e) => { setSeg(e.target.value); setShown(PAGE); }} className="input w-auto" aria-label={t("Segment")}>
          <option value="">{t("All segments")}</option>
          {segments.map((s) => <option key={s} value={s}>{groupName(t, s)}</option>)}
        </select>
        <select value={lvl} onChange={(e) => { setLvl(e.target.value); setShown(PAGE); }} className="input w-auto" aria-label={t("Chance to come")}>
          <option value="">{t("Any chance")}</option>
          {LEVELS.map((l) => <option key={l.key} value={l.key}>{t(l.label)}</option>)}
        </select>
        <button type="button" onClick={exportCsv} className="btn-ghost" disabled={!list.length}>{t("Export CSV")}</button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="pb-2 font-medium">{t("Participant")}</th>
              <th className="pb-2 font-medium">{t("Team")}</th>
              <th className="pb-2 font-medium">{t("University")}</th>
              <th className="pb-2 font-medium">{t("Year of study")}</th>
              <th className="pb-2 font-medium">{t("Segment")}</th>
              <th className="pb-2 text-right font-medium">{t("Chance")}</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, shown).map((p, i) => (
              <tr key={i} className="border-b border-line/60 align-top">
                <td className="py-2 pr-3">
                  <div>{p.name || "—"}</div>
                  <div className="text-xs text-ink-faint">{[p.telegram, p.email].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="py-2 pr-3 text-ink-muted">{p.team || "—"}</td>
                <td className="py-2 pr-3 text-ink-muted">{p.university || "—"}</td>
                <td className="py-2 pr-3 text-ink-muted">{p.year || "—"}</td>
                <td className="py-2 pr-3">{groupName(t, p.segment)}</td>
                <td className="py-2 text-right"><RateBar p={p.probability} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn-ghost mt-4">{t("Show more")}</button>
      )}
    </section>
  );
}

export function HowItWorks({ model, sheet }: { model: { version: string; trainedOn: string }; sheet: boolean }) {
  const t = useT();
  return (
    <section className="card p-5 text-sm leading-relaxed text-ink-muted">
      <h2 className="font-display text-base font-semibold text-ink">{t("How it is calculated")}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li><b className="text-ink">{t("Chance to come")}</b> — {t("from a model trained on Business Cup S26: 1 018 invited people and their day-1 check-in. It looks at team status and size, university, year, major, interest in Zimran, past AIESEC projects and how close to the deadline the person registered. In testing it got the total turnout right (601 of 601), but is often wrong about a single person.")}</li>
        <li><b className="text-ink">{t("How many will come")}</b> — {t("the sum of the chances. The range is wider than for coin tosses, because teams come or stay away together.")}</li>
        <li><b className="text-ink">{t("Registrations by the deadline")}</b> — {t("from the shape of the final week of past projects: in their last 7 days 1.9× (Creative One), 2.7× (Higgsfield) and 4.1× (Business Cup S26) as many people registered as in the 7 days before. The base is Higgsfield.")}</li>
        <li><b className="text-ink">{t("How many to invite")}</b> — {t("people are sorted by ICP segment (P0 → P1 → P2), then by chance, and taken until the expected turnout reaches the target. Better to invite whole teams.")}</li>
        <li>{t("The model does not know about confirmations in the bot or calls. A «coming / not coming» answer beats any estimate, so after the survey trust it.")}</li>
      </ul>
      {sheet && <p className="mt-3 text-xs text-ink-faint">{t("The file is read only in your browser and is not sent anywhere.")}</p>}
      <p className="mt-3 text-xs text-ink-faint">{t("Model {version} · {trainedOn}", { version: model.version, trainedOn: model.trainedOn })}</p>
    </section>
  );
}
