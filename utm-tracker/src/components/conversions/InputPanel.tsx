"use client";

import { useState } from "react";
import { computeRatios, formatFraction, formatShare, validateInputs } from "@/lib/conversions/compute";
import type { ConversionState, InputState } from "@/lib/conversions/state";
import { ru } from "./api";
import { BreakdownLine } from "./Breakdown";

type AutoKey = "projectRegs" | "regOgx";
type ManualKey = "showUp" | "aiesecOrgSignup";

const toNum = (s: string): number | null => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function sourceBadge(s: InputState): string {
  if (s.mode === "manual") return "вручную";
  if (s.origin.startsWith("из таблицы")) return "из таблицы";
  if (s.origin.startsWith("из файла")) return "из файла";
  if (s.origin.startsWith("из отчёта")) return "из отчёта";
  if (s.origin.startsWith("с сайта")) return "с сайта";
  return "нет источника";
}

export function InputPanel({
  state,
  busy,
  onSaveManual,
  onOverride,
  onRefresh,
  onSnapshot,
}: {
  state: ConversionState;
  busy: string | null;
  onSaveManual: (v: { showUp: number | null; aiesecOrgSignup: number | null; asOf: string | null; note: string | null }) => Promise<void>;
  onOverride: (key: AutoKey, v: { value: number; reason: string } | null) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSnapshot: (v: { asOfDate: string | null; note: string | null }) => Promise<void>;
}) {
  const m = state.inputs;
  const today = new Date().toISOString().slice(0, 10);
  const [manual, setManual] = useState({
    showUp: m.showUp.value === null ? "" : String(m.showUp.value),
    aiesecOrgSignup: m.aiesecOrgSignup.value === null ? "" : String(m.aiesecOrgSignup.value),
    asOf: m.aiesecOrgSignup.manual?.asOf ?? m.showUp.manual?.asOf ?? today,
    note: m.aiesecOrgSignup.manual?.note ?? m.showUp.manual?.note ?? "",
  });
  const [editing, setEditing] = useState<AutoKey | null>(null);
  const [override, setOverride] = useState({ value: "", reason: "" });

  const typed = { showUp: toNum(manual.showUp), aiesecOrgSignup: toNum(manual.aiesecOrgSignup) };
  const dirty = typed.showUp !== m.showUp.value || typed.aiesecOrgSignup !== m.aiesecOrgSignup.value;
  const values = { projectRegs: m.projectRegs.value, regOgx: m.regOgx.value, ...typed };
  const { errors, warnings } = validateInputs(values);
  const preview = computeRatios(values);

  const manualField = (key: ManualKey) => (
    <div key={key}>
      <label className="label" htmlFor={`conv-${key}`}>
        {m[key].label} <span className="text-ink-faint">· вручную, чел.</span>
      </label>
      <input
        id={`conv-${key}`}
        className="input num"
        inputMode="numeric"
        placeholder="не введено"
        value={manual[key]}
        aria-invalid={!!errors[key]}
        aria-describedby={`conv-${key}-msg`}
        onChange={(e) => setManual({ ...manual, [key]: e.target.value })}
      />
      <p id={`conv-${key}-msg`} className="mt-1 text-xs">
        {errors[key] ? <span className="text-danger">✕ {errors[key]}</span> : warnings[key] ? <span className="text-accent">⚠ {warnings[key]}</span> : m[key].manual ? <span className="text-ink-faint">{m[key].origin}</span> : null}
      </p>
    </div>
  );

  const autoField = (key: AutoKey) => {
    const s = m[key];
    const canRefresh = key === "projectRegs" && state.config.registrationSheet;
    return (
      <div key={key} className="rounded-xl border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="label mb-0">{s.label}</span>
          <span className="pill border border-line text-ink-muted">{sourceBadge(s)}</span>
        </div>
        <p className={`num mt-1 font-display text-2xl font-semibold ${s.value === null ? "text-ink-faint" : "text-ink"}`}>{s.value === null ? "нет данных" : `${ru(s.value)} чел.`}</p>
        <p className="mt-0.5 text-xs text-ink-faint">{s.origin}</p>
        {s.breakdown && <div className="mt-2"><BreakdownLine b={s.breakdown} /></div>}
        {s.note && <p className="mt-2 text-xs text-accent">⚠ {s.note}</p>}
        {warnings[key] && <p className="mt-1 text-xs text-accent">⚠ {warnings[key]}</p>}
        {s.override && <p className="mt-2 text-xs text-ink-muted">Причина: {s.override.reason}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {canRefresh && (
            <button type="button" className="btn-ghost border border-line text-xs" disabled={!!busy} onClick={onRefresh}>
              {busy === "refresh" ? "Обновляю…" : "↻ Обновить из источника"}
            </button>
          )}
          {s.override ? (
            <button type="button" className="btn-ghost border border-line text-xs" disabled={!!busy} onClick={() => onOverride(key, null)}>
              Вернуть авто-значение
            </button>
          ) : (
            <button type="button" className="btn-ghost border border-line text-xs" onClick={() => { setEditing(key); setOverride({ value: s.value === null ? "" : String(s.value), reason: "" }); }}>
              Переопределить
            </button>
          )}
        </div>
        {editing === key && (
          <form
            className="mt-3 space-y-2 border-t border-line pt-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await onOverride(key, { value: toNum(override.value) ?? NaN, reason: override.reason });
              setEditing(null);
            }}
          >
            <label className="label" htmlFor={`ov-${key}`}>Значение вручную, чел.</label>
            <input id={`ov-${key}`} className="input num" inputMode="numeric" value={override.value} onChange={(e) => setOverride({ ...override, value: e.target.value })} />
            <label className="label" htmlFor={`ovr-${key}`}>Причина (обязательно)</label>
            <input id={`ovr-${key}`} className="input" required value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} placeholder="например, часть регистраций была на бумаге" />
            <div className="flex gap-2">
              <button className="btn-primary text-xs" disabled={!override.reason.trim() || !!busy}>Сохранить</button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(null)}>Отмена</button>
            </div>
          </form>
        )}
      </div>
    );
  };

  const [snap, setSnap] = useState({ asOfDate: today, note: "" });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">{(["projectRegs", "regOgx"] as const).map(autoField)}</div>

      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSaveManual({ ...typed, asOf: manual.asOf || null, note: manual.note.trim() || null });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">{(["showUp", "aiesecOrgSignup"] as const).map(manualField)}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="conv-asof">По состоянию на</label>
            <input id="conv-asof" type="date" className="input" value={manual.asOf} onChange={(e) => setManual({ ...manual, asOf: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="conv-note">Примечание / источник</label>
            <input id="conv-note" className="input" value={manual.note} placeholder="например, данные с aiesec.org" onChange={(e) => setManual({ ...manual, note: e.target.value })} />
          </div>
        </div>

        {dirty && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-3" aria-live="polite">
            <p className="mb-2 text-xs text-accent">Предпросмотр (ещё не сохранено)</p>
            <ul className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              {preview.map((r) => (
                <li key={r.key} className="flex justify-between gap-3">
                  <span className="text-ink-muted">{r.label}</span>
                  <span className="num text-ink">{r.value === null ? "нет данных" : `${formatShare(r.value)} (${formatFraction(r.num, r.den)})`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button className="btn-primary text-sm" disabled={!dirty || Object.keys(errors).length > 0 || !!busy}>
          {busy === "manual" ? "Сохраняю…" : "Сохранить"}
        </button>
      </form>

      <form
        className="flex flex-wrap items-end gap-3 border-t border-line pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSnapshot({ asOfDate: snap.asOfDate || null, note: snap.note.trim() || null });
          setSnap({ ...snap, note: "" });
        }}
      >
        <div>
          <label className="label" htmlFor="snap-date">Дата снимка</label>
          <input id="snap-date" type="date" className="input" value={snap.asOfDate} onChange={(e) => setSnap({ ...snap, asOfDate: e.target.value })} />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor="snap-note">Комментарий</label>
          <input id="snap-note" className="input" value={snap.note} onChange={(e) => setSnap({ ...snap, note: e.target.value })} />
        </div>
        <button className="btn-ghost border border-line text-sm" disabled={dirty || !!busy} title={dirty ? "Сначала сохраните введённые числа" : undefined}>
          {busy === "snapshot" ? "Фиксирую…" : "📌 Зафиксировать снимок"}
        </button>
      </form>
    </div>
  );
}
