"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { MODEL_INFO, REQUIRED_FIELDS, detectColumns, missingRequired, rowsFromSheet, type Field } from "@/lib/attendanceForecast/forecastCore";
import { buildForecast, DEFAULT_TARGET, type ForecastSummary } from "@/lib/attendanceForecast/summary";
import { readRegistrationSheet, type LoadedFile } from "@/lib/attendanceForecast/sheet";
import { ForecastView, HowItWorks } from "./ForecastView";

/**
 * «Attendance forecast (beta)»: source A — a project folder's registrations on the site (computed
 * by the API); source B — a registration sheet read in the browser and never uploaded.
 */

export interface ForecastFolder {
  key: string;
  title: string;
  deadline: string | null;
  target: number | null;
}

type Filled = Record<string, number>;
type SiteResult = { registrations: number; filled: Filled; forecast: ForecastSummary | null };

/** Chip labels, in the order the chips are shown. */
const FIELD_LABEL: [Field, string][] = [
  ["createdAt", "registration date"],
  ["participationType", "participation type"],
  ["university", "university"],
  ["yearOfStudy", "year of study"],
  ["email", "e-mail"],
  ["teamName", "team"],
  ["major", "major"],
  ["zimranInterest", "Zimran"],
  ["previousAiesecProject", "past AIESEC project"],
  ["segment", "ICP segment"],
  ["name", "name"],
  ["telegram", "Telegram"],
];
const TEMPLATE = "/templates/registration-sheet-template.xlsx";

export function AttendanceForecast({ folders, admin, initialFolder }: { folders: ForecastFolder[]; admin: boolean; initialFolder?: string }) {
  const t = useT();
  const [source, setSource] = useState<"site" | "sheet">(folders.length ? "site" : "sheet");
  const start = folders.find((f) => f.key === initialFolder) ?? folders[0];
  const [folder, setFolder] = useState(start?.key ?? "");
  const [deadline, setDeadline] = useState(start?.deadline ?? "");
  const [target, setTarget] = useState(start?.target ?? DEFAULT_TARGET);
  const [useSegments, setUseSegments] = useState(true);

  // A — the site's data
  const [site, setSite] = useState<SiteResult | null>(null);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const savedFor = useRef(new Map(folders.map((f) => [f.key, { deadline: f.deadline ?? "", target: f.target ?? DEFAULT_TARGET }])));

  function pickFolder(key: string) {
    setFolder(key);
    const s = savedFor.current.get(key);
    setDeadline(s?.deadline ?? "");
    setTarget(s?.target ?? DEFAULT_TARGET);
    setSite(null);
  }

  useEffect(() => {
    if (source !== "site" || !folder) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setSiteError(null);
      try {
        const q = new URLSearchParams({ target: String(target || DEFAULT_TARGET), segments: useSegments ? "1" : "0", people: admin ? "1" : "0" });
        if (deadline) q.set("deadline", deadline);
        const res = await fetch(`/api/project-folders/${encodeURIComponent(folder)}/attendance-forecast?${q}`, { signal: ctl.signal, cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? t("Request failed ({status})", { status: res.status }));
        setSite(data);
        // the deadline and target the team set are remembered for the project
        const prev = savedFor.current.get(folder);
        if (deadline && (prev?.deadline !== deadline || prev?.target !== target)) {
          const put = await fetch(`/api/project-folders/${encodeURIComponent(folder)}/attendance-forecast`, {
            method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ deadline, target: target || DEFAULT_TARGET }),
          });
          if (put.ok) { savedFor.current.set(folder, { deadline, target }); setSaved(folder); }
        }
      } catch (e) {
        if (!ctl.signal.aborted) setSiteError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [source, folder, deadline, target, useSegments, admin, t]);

  // B — an uploaded sheet
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [manual, setManual] = useState<Partial<Record<Field, string>>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setReading(true);
    setFileError(null);
    try {
      const loaded = await readRegistrationSheet(f);
      if (!loaded.sheets.some((s) => s.objects.length)) throw new Error(t("The file has no rows."));
      setFile(loaded);
      setSheetName(loaded.best ?? loaded.sheets[0].name);
      setManual({});
    } catch (e) {
      setFile(null);
      setFileError(t("Could not read the file: {error}", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setReading(false);
    }
  }

  const sheet = file?.sheets.find((s) => s.name === sheetName) ?? null;
  const map = useMemo(() => {
    if (!sheet) return null;
    const m = detectColumns(sheet.headers);
    for (const [f, h] of Object.entries(manual)) if (h) m[f as Field] = h;
    return m;
  }, [sheet, manual]);
  const missing = map ? missingRequired(map) : [];
  const sheetForecast = useMemo(() => {
    if (!sheet || !map || missing.length || !deadline) return null;
    const rows = rowsFromSheet(sheet.objects, map);
    if (!rows.length) return null;
    const asOf = rows.reduce((a, r) => (r.createdAt > a ? r.createdAt : a), rows[0].createdAt);
    return buildForecast(rows, { deadline, asOf, target: target || DEFAULT_TARGET, useSegments, withPeople: admin });
  }, [sheet, map, missing.length, deadline, target, useSegments, admin]);

  const forecast = source === "site" ? site?.forecast ?? null : sheetForecast;
  const current = folders.find((f) => f.key === folder);

  return (
    <div className="space-y-6">
      {/* source */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-muted">{t("Source:")}</span>
        <div className="inline-flex rounded-full border border-line bg-bg-raised p-1" role="tablist">
          {(["site", "sheet"] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={source === s} onClick={() => setSource(s)} disabled={s === "site" && !folders.length}
              className={cn("rounded-full px-4 py-1.5 text-sm transition", source === s ? "bg-bg-hover font-medium text-ink" : "text-ink-muted hover:text-ink")}>
              {s === "site" ? t("Project data on the site") : t("Upload a registration sheet")}
            </button>
          ))}
        </div>
      </div>

      {/* settings */}
      <section className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {source === "site" && (
            <div className="lg:col-span-2">
              <label className="label" htmlFor="fc-folder">{t("Project")}</label>
              <select id="fc-folder" className="input" value={folder} onChange={(e) => pickFolder(e.target.value)}>
                {folders.map((f) => <option key={f.key} value={f.key}>{f.title}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="fc-deadline">{t("Registration deadline")}</label>
            <input id="fc-deadline" type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            {source === "site" && saved === folder && current && <p className="hint">{t("Saved for {project}.", { project: current.title })}</p>}
          </div>
          <div>
            <label className="label" htmlFor="fc-target">{t("People needed at the event")}</label>
            <input id="fc-target" type="number" min={1} className="input" value={target || ""} onChange={(e) => setTarget(Math.max(0, Math.round(Number(e.target.value))))} />
          </div>
          <label className={cn("flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4", forecast && !forecast.hasSegments && "opacity-50")}>
            <input type="checkbox" checked={useSegments && (!forecast || forecast.hasSegments)} disabled={!!forecast && !forecast.hasSegments} onChange={(e) => setUseSegments(e.target.checked)} />
            {t("Invite by ICP segment (P0 → P1 → P2)")}
            {forecast && !forecast.hasSegments && <span className="text-xs text-ink-faint">· {t("the data has no segments")}</span>}
          </label>
        </div>

        {source === "sheet" && (
          <div className="mt-5 border-t border-line pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn-primary cursor-pointer">
                {reading ? t("Reading…") : file ? t("Choose another file") : t("Choose a file (.xlsx, .xls, .csv)")}
                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <a href={TEMPLATE} download="Шаблон_рег_шита.xlsx" className="btn-ghost">{t("Download template")}</a>
              {file && <span className="text-sm text-ink-muted">{file.fileName}</span>}
            </div>
            <p className="hint">{t("The file is read only in your browser: it is not uploaded or saved. Headers in the first row, one row per registration; column order does not matter.")}</p>
            {fileError && <p className="mt-3 text-sm text-danger">{fileError}</p>}
            {file && file.sheets.length > 1 && (
              <div className="mt-4 max-w-xs">
                <label className="label" htmlFor="fc-sheet">{t("Sheet")}</label>
                <select id="fc-sheet" className="input" value={sheetName} onChange={(e) => { setSheetName(e.target.value); setManual({}); }}>
                  {file.sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            )}
            {sheet && map && (
              <>
                <Chips have={(f) => !!map[f]} title={(f) => map[f]} />
                {missing.length > 0 && (
                  <div className="mt-4 rounded-xl border border-danger/40 bg-danger/5 p-4">
                    <p className="text-sm text-danger">
                      {t("Required columns not found: {fields}. Pick them by hand or rename the headers.", { fields: missing.map((f) => t(FIELD_LABEL.find(([k]) => k === f)![1])).join(", ") })}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {missing.map((f) => (
                        <div key={f}>
                          <label className="label" htmlFor={`fc-col-${f}`}>{t(FIELD_LABEL.find(([k]) => k === f)![1])}</label>
                          <select id={`fc-col-${f}`} className="input" value={manual[f] ?? ""} onChange={(e) => setManual((m) => ({ ...m, [f]: e.target.value }))}>
                            <option value="">{t("— pick a column —")}</option>
                            {sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {source === "site" && site && (
          <div className="mt-5 border-t border-line pt-5">
            <p className="text-sm text-ink-muted">{t("{n} registrations of this project on the site (its own campaign's leads).", { n: site.registrations.toLocaleString() })}</p>
            {site.registrations > 0 && (
              <>
                <Chips inline have={(f) => f === "createdAt" || f === "email" || f === "name" || (site.filled[f] ?? 0) > 0}
                  title={(f) => (site.filled[f] !== undefined ? `${Math.round((site.filled[f] / site.registrations) * 100)}%` : undefined)} />
                {REQUIRED_FIELDS.some((f) => f !== "createdAt" && !site.filled[f]) && (
                  <p className="mt-3 text-xs text-amber-300">
                    {t("The site's registrations lack some form answers, so the chance to come is rougher. For a sharper forecast upload the registration sheet or import it in Data.")}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* states */}
      {source === "site" && siteError && <p className="text-sm text-danger">{siteError}</p>}
      {!deadline && (source === "site" ? !!folder : !!sheet && !missing.length) && (
        <Notice>{t("Set the registration deadline to see the forecast.")}</Notice>
      )}
      {source === "site" && loading && !site && <p className="text-sm text-ink-faint">{t("Counting…")}</p>}
      {forecast && forecast.unique === 0 && <Notice>{t("No registrations yet: nothing to forecast.")}</Notice>}
      {forecast && forecast.unique > 0 && (
        <>
          <p className="text-xs text-ink-faint">
            {t("{n} unique registrations", { n: forecast.unique.toLocaleString() })}
            {forecast.repeats > 0 && ` · ${t("{n} repeats by e-mail dropped", { n: forecast.repeats.toLocaleString() })}`}
            {forecast.lastAt && ` · ${t("last one {time}", { time: forecast.lastAt })}`}
          </p>
          {forecast.few && <Notice tone="warn">{t("Too little data for a forecast: fewer than 50 registrations. Treat the numbers as a rough guide.")}</Notice>}
          <div className={cn(loading && source === "site" && "opacity-60 transition-opacity")}>
            <ForecastView s={forecast} admin={admin} />
          </div>
        </>
      )}

      <HowItWorks model={forecast?.model ?? MODEL_INFO} sheet={source === "sheet"} />
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", tone === "warn" ? "border-amber-400/40 bg-amber-400/5 text-amber-200" : "border-line bg-bg-raised text-ink-muted")}>
      {children}
    </div>
  );
}

/** ✓ found / «no: …» chips for the forecast's columns. */
function Chips({ have, title, inline }: { have: (f: Field) => boolean; title: (f: Field) => string | undefined; inline?: boolean }) {
  const t = useT();
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {FIELD_LABEL.map(([f, label]) => {
        const ok = have(f);
        const required = REQUIRED_FIELDS.includes(f);
        return (
          <span key={f} title={ok ? title(f) : undefined}
            className={cn("pill", ok ? "bg-leads/12 text-leads" : required ? "bg-danger/12 text-danger" : "bg-bg-hover text-ink-faint")}>
            {ok ? `✓ ${t(label)}` : t("no: {field}", { field: t(label) })}
            {inline && ok && title(f) && <span className="text-ink-faint">· {title(f)}</span>}
          </span>
        );
      })}
    </div>
  );
}
