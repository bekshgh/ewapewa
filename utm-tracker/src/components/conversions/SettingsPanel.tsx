"use client";

import { useState } from "react";
import type { ConversionState } from "@/lib/conversions/state";
import { call, ru } from "./api";

type Column = { name: string; samples: string[] };
type Preview = { tabs: string[]; tab?: string | null; rows: number; columns: Column[]; guess: Record<string, string>; spreadsheetId?: string };
type Map = { emailCol: string; timeCol: string; nameCol: string; phoneCol: string; utmCol: string };

const FIELDS: [keyof Map, string, boolean][] = [
  ["emailCol", "Колонка email", true],
  ["timeCol", "Время регистрации", false],
  ["nameCol", "Имя", false],
  ["phoneCol", "Телефон", false],
  ["utmCol", "UTM (utm_campaign)", false],
];

const emptyMap = (g: Record<string, string> = {}): Map => ({
  emailCol: g.emailCol ?? "",
  timeCol: g.timeCol ?? "",
  nameCol: g.nameCol ?? "",
  phoneCol: g.phoneCol ?? "",
  utmCol: g.utmCol ?? "",
});

function ColumnPicker({ preview, map, setMap }: { preview: Preview; map: Map; setMap: (m: Map) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">Найдено строк: {ru(preview.rows)}. Колонки и примеры значений:</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([key, label, required]) => (
          <div key={key}>
            <label className="label" htmlFor={`col-${key}`}>{label}{required ? " *" : ""}</label>
            <select id={`col-${key}`} className="input" value={map[key]} required={required} onChange={(e) => setMap({ ...map, [key]: e.target.value })}>
              <option value="">{required ? "— выберите —" : "— нет —"}</option>
              {preview.columns.map((c) => (
                <option key={c.name} value={c.name}>{c.name}{c.samples[0] ? ` (напр. ${c.samples[0].slice(0, 24)})` : ""}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({
  projectId,
  state,
  campaigns,
  serviceAccountEmail,
  onChanged,
}: {
  projectId: string;
  state: ConversionState;
  campaigns: { id: string; name: string; label: string | null }[];
  serviceAccountEmail: string | null;
  onChanged: (s: ConversionState) => void;
}) {
  const base = `/api/projects/${projectId}/conversion`;
  const sheet = state.config.registrationSheet;
  const [link, setLink] = useState(sheet ? `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}` : "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [map, setMap] = useState<Map>(emptyMap(sheet ? { ...sheet } as Record<string, string> : {}));
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<Preview | null>(null);
  const [fileMap, setFileMap] = useState<Map>(emptyMap());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const patch = (config: Record<string, unknown>) =>
    call<{ state: ConversionState }>(base, { method: "PATCH", body: JSON.stringify({ config }) }).then((r) => onChanged(r.state));

  const nonEmpty = (m: Map) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v || null]));

  return (
    <div className="space-y-6">
      {/* Google Sheet */}
      <section aria-labelledby="set-sheet">
        <h4 id="set-sheet" className="mb-1 text-sm font-semibold text-ink">Таблица регистраций проекта</h4>
        <p className="mb-2 text-xs text-ink-faint">
          {serviceAccountEmail ? (
            <>Откройте таблицу → «Настройки доступа» → добавьте <span className="font-mono text-ink-muted">{serviceAccountEmail}</span> как читателя.</>
          ) : (
            <>Google ещё не подключён к сайту (см. docs/conversions.md). Пока можно загрузить файл таблицы ниже.</>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-[16rem] flex-1" placeholder="https://docs.google.com/spreadsheets/d/…" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Ссылка на Google-таблицу" />
          <button
            type="button"
            className="btn-ghost border border-line text-sm"
            disabled={!link || !!busy}
            onClick={() =>
              run("check", async () => {
                const p = await call<Preview>(`${base}/sheet`, { method: "POST", body: JSON.stringify({ link, tab: preview?.tab ?? sheet?.tab ?? null }) });
                setPreview(p);
                setMap((m) => (m.emailCol ? m : emptyMap(p.guess)));
              })
            }
          >
            {busy === "check" ? "Проверяю…" : "Проверить доступ"}
          </button>
        </div>
        {preview && (
          <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
            <div>
              <label className="label" htmlFor="set-tab">Лист</label>
              <select
                id="set-tab"
                className="input max-w-xs"
                value={preview.tab ?? ""}
                onChange={(e) =>
                  run("check", async () => {
                    const p = await call<Preview>(`${base}/sheet`, { method: "POST", body: JSON.stringify({ link, tab: e.target.value }) });
                    setPreview(p);
                    setMap(emptyMap(p.guess));
                  })
                }
              >
                {preview.tabs.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <ColumnPicker preview={preview} map={map} setMap={setMap} />
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={!map.emailCol || !!busy}
              onClick={() =>
                run("saveSheet", async () => {
                  await patch({ registrationSheet: { spreadsheetId: preview.spreadsheetId, tab: preview.tab, ...nonEmpty(map) } });
                  const r = await call<{ state: ConversionState }>(`${base}/refresh`, { method: "POST" });
                  onChanged(r.state);
                  setPreview(null);
                  setMsg({ ok: true, text: "Таблица подключена и прочитана." });
                })
              }
            >
              {busy === "saveSheet" ? "Сохраняю…" : "Сохранить и прочитать"}
            </button>
          </div>
        )}
        {sheet && !preview && (
          <p className="mt-2 text-xs text-ink-muted">
            Подключено: лист «{sheet.tab}», email — «{sheet.emailCol}».{" "}
            <button type="button" className="text-danger hover:underline" onClick={() => run("unlink", () => patch({ registrationSheet: null }))}>Отключить</button>
          </p>
        )}
      </section>

      {/* File upload */}
      <section aria-labelledby="set-file">
        <h4 id="set-file" className="mb-1 text-sm font-semibold text-ink">Или загрузите файл таблицы</h4>
        <p className="mb-2 text-xs text-ink-faint">Google Таблицы: Файл → Скачать → CSV или Microsoft Excel (.xlsx). Сам файл не сохраняется.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,.xlsx"
            aria-label="Файл таблицы регистраций"
            className="text-xs text-ink-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-bg-raised file:px-3 file:py-1.5 file:text-ink"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setFilePreview(null);
              if (!f) return;
              const fd = new FormData();
              fd.set("file", f);
              run("filePreview", async () => {
                const r = await call<{ preview: Preview }>(`${base}/upload`, { method: "POST", body: fd });
                setFilePreview(r.preview);
                setFileMap(emptyMap(r.preview.guess));
              });
            }}
          />
          {busy === "filePreview" && <span className="text-xs text-ink-muted">Читаю файл…</span>}
        </div>
        {file && filePreview && (
          <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
            <ColumnPicker preview={filePreview} map={fileMap} setMap={setFileMap} />
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={!fileMap.emailCol || !!busy}
              onClick={() =>
                run("upload", async () => {
                  const fd = new FormData();
                  fd.set("file", file);
                  for (const [k, v] of Object.entries(fileMap)) if (v) fd.set(k, v);
                  const r = await call<{ state: ConversionState }>(`${base}/upload`, { method: "POST", body: fd });
                  onChanged(r.state);
                  setFile(null);
                  setFilePreview(null);
                  setMsg({ ok: true, text: "Файл обработан." });
                })
              }
            >
              {busy === "upload" ? "Обрабатываю…" : "Посчитать регистрации"}
            </button>
          </div>
        )}
      </section>

      {/* oGX campaign + counting policy */}
      <section className="grid gap-4 sm:grid-cols-2" aria-label="oGX-кампания и правила подсчёта">
        <div>
          <label className="label" htmlFor="set-campaign">oGX-кампания проекта</label>
          <select
            id="set-campaign"
            className="input"
            value={state.config.ogxCampaign?.id ?? ""}
            disabled={!!busy}
            onChange={(e) => run("campaign", () => patch({ ogxCampaignId: e.target.value || null }))}
          >
            <option value="">— не выбрана —</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label ? `${c.label} (${c.name})` : c.name}</option>)}
          </select>
          <p className="hint mt-1">Рега oGX = уникальные заявки по ссылкам этой кампании или с её utm_campaign.</p>
        </div>
        <div>
          <span className="label">Записи «на проверке»</span>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={state.config.countSuspicious}
              disabled={!!busy}
              onChange={(e) => run("policy", () => patch({ countSuspicious: e.target.checked }))}
            />
            Учитывать в итоговом числе
          </label>
          <p className="hint mt-1">Карантин и отмеченные фейком не учитываются никогда.</p>
        </div>
      </section>

      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-leads" : "text-danger"}`}>{msg.ok ? "✓ " : "✕ "}{msg.text}</p>}
    </div>
  );
}
