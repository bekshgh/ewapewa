"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n/client";
import { readRegistrationSheet, type LoadedFile } from "@/lib/attendanceForecast/sheet";
import { detectFileColumns, pickReconcileSheet, reconcile, type FileField, type Reconciliation, type SiteLead } from "@/lib/reconcile";

/**
 * Registration check: the form's own export (e.g. Zimran's candidates) against the project's leads
 * on the site. The file is read and compared in the browser and never uploaded.
 */

export interface ReconcileFolder { key: string; title: string }

const FIELDS: [FileField, string][] = [
  ["email", "e-mail"],
  ["phone", "phone"],
  ["createdAt", "registration date"],
  ["tag", "tag (UTM)"],
];

export function Reconcile({ folders, initialFolder }: { folders: ReconcileFolder[]; initialFolder?: string }) {
  const t = useT();
  const [folder, setFolder] = useState((folders.find((f) => f.key === initialFolder) ?? folders[0])?.key ?? "");
  const [leads, setLeads] = useState<SiteLead[] | null>(null);
  const [siteError, setSiteError] = useState<string | null>(null);

  useEffect(() => {
    if (!folder) return;
    const ctl = new AbortController();
    setLeads(null);
    setSiteError(null);
    fetch(`/api/project-folders/${encodeURIComponent(folder)}/reconcile`, { signal: ctl.signal, cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? t("Request failed ({status})", { status: res.status }));
        setLeads(data.leads);
      })
      .catch((e) => { if (!ctl.signal.aborted) setSiteError(e instanceof Error ? e.message : String(e)); });
    return () => ctl.abort();
  }, [folder, t]);

  const [file, setFile] = useState<LoadedFile | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [manual, setManual] = useState<Partial<Record<FileField, string>>>({});
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
      setSheetName(pickReconcileSheet(loaded.sheets) ?? loaded.sheets[0].name);
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
    const m = detectFileColumns(sheet.headers);
    for (const [f, h] of Object.entries(manual)) if (h) m[f as FileField] = h;
    return m;
  }, [sheet, manual]);
  const noContact = !!map && !map.email && !map.phone;
  const result = useMemo(
    () => (sheet && map && !noContact && leads ? reconcile(sheet.objects, map, leads) : null),
    [sheet, map, noContact, leads],
  );

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rc-folder">{t("Project")}</label>
            <select id="rc-folder" className="input" value={folder} onChange={(e) => setFolder(e.target.value)}>
              {folders.map((f) => <option key={f.key} value={f.key}>{f.title}</option>)}
            </select>
            <p className="hint">
              {siteError ? <span className="text-danger">{siteError}</span>
                : leads ? t("{n} leads of this project on the site.", { n: leads.length.toLocaleString() })
                : t("Counting…")}
            </p>
          </div>
          {file && file.sheets.length > 1 && (
            <div>
              <label className="label" htmlFor="rc-sheet">{t("Sheet")}</label>
              <select id="rc-sheet" className="input" value={sheetName} onChange={(e) => { setSheetName(e.target.value); setManual({}); }}>
                {file.sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-primary cursor-pointer">
              {reading ? t("Reading…") : file ? t("Choose another file") : t("Choose the form's export (.xlsx, .xls, .csv)")}
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {file && <span className="text-sm text-ink-muted">{file.fileName}</span>}
          </div>
          <p className="hint">{t("The file is read only in your browser: it is not uploaded or saved. People are matched by e-mail, else by phone.")}</p>
          {fileError && <p className="mt-3 text-sm text-danger">{fileError}</p>}
          {sheet && map && (
            <>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {FIELDS.map(([f, label]) => (
                  <span key={f} title={map[f]} className={cn("pill", map[f] ? "bg-leads/12 text-leads" : "bg-bg-hover text-ink-faint")}>
                    {map[f] ? `✓ ${t(label)}` : t("no: {field}", { field: t(label) })}
                    {map[f] && <span className="text-ink-faint">· {map[f]}</span>}
                  </span>
                ))}
              </div>
              {(noContact || !map.tag) && (
                <div className={cn("mt-4 rounded-xl border p-4", noContact ? "border-danger/40 bg-danger/5" : "border-line bg-bg-raised")}>
                  <p className={cn("text-sm", noContact ? "text-danger" : "text-ink-muted")}>
                    {noContact ? t("No e-mail or phone column found: pick it by hand.") : t("No tag column found: pick it to compare channels too.")}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(noContact ? (["email", "tag"] as FileField[]) : (["tag"] as FileField[])).map((f) => (
                      <div key={f}>
                        <label className="label" htmlFor={`rc-col-${f}`}>{t(FIELDS.find(([k]) => k === f)![1])}</label>
                        <select id={`rc-col-${f}`} className="input" value={manual[f] ?? ""} onChange={(e) => setManual((m) => ({ ...m, [f]: e.target.value }))}>
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
      </section>

      {result && <Results r={result} hasTag={!!map?.tag} />}
      <WhyTheyDiffer />
    </div>
  );
}

const useNum = () => {
  const lang = useLang();
  return (n: number) => n.toLocaleString(lang === "ru" ? "ru-RU" : "en-GB");
};
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "leads" | "danger" }) {
  return (
    <div className="card flex flex-col p-5">
      <div className="text-sm text-ink-muted">{label}</div>
      <div className={cn("num mt-3 text-4xl font-bold tracking-tight", tone === "leads" ? "text-leads" : tone === "danger" ? "text-danger" : "text-ink")}>{value}</div>
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">{note}</p>
    </div>
  );
}

function Bar({ n, of, tone = "bg-accent" }: { n: number; of: number; tone?: string }) {
  return (
    <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-bg-hover sm:inline-block">
      <i className={cn("block h-full rounded-full", tone)} style={{ width: `${of ? (n / of) * 100 : 0}%` }} />
    </span>
  );
}

function Results({ r, hasTag }: { r: Reconciliation; hasTag: boolean }) {
  const t = useT();
  const num = useNum();
  const k = r.site.byKind;
  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-ink-faint">
        {t("File: {rows} rows, {people} people", { rows: num(r.file.rows), people: num(r.file.people) })}
        {r.file.repeats > 0 && ` (${t("{n} repeat sends", { n: num(r.file.repeats) })})`}
        {r.file.from && ` · ${r.file.from} — ${r.file.to}`}
        {r.file.noContact > 0 && ` · ${t("{n} rows without e-mail or phone", { n: num(r.file.noContact) })}`}
        <br />
        {t("Site: {people} people in the same period", { people: num(r.site.people) })}
        {` · ${t("by link {link}, direct {direct}, imported {imported}, webhook {webhook}", { link: num(k.link), direct: num(k.direct), imported: num(k.import), webhook: num(k.form) })}`}
        {r.site.outside > 0 && ` · ${t("{n} more leads outside the file's period are left out", { n: num(r.site.outside) })}`}
        {r.site.noContact > 0 && ` · ${t("{n} leads without e-mail or phone", { n: num(r.site.noContact) })}`}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("In both")} value={num(r.matched)} tone="leads" note={t("{p} of the people in the file", { p: pct(r.matched, r.file.people) })} />
        <Tile label={t("Only in the file")} value={num(r.onlyFile.length)} tone={r.onlyFile.length ? "danger" : undefined} note={t("Registered in the form, but the site did not record them.")} />
        <Tile label={t("Only on the site")} value={num(r.onlySite.length)} note={t("The site recorded them, but they are not in the export.")} />
        <Tile label={t("Same tag")} value={hasTag ? pct(r.tags.same + r.tags.bothEmpty, r.matched) : "—"}
          note={hasTag ? t("of the people in both: the channel in the file and on the site agree") : t("The file has no tag column.")} />
      </div>

      {hasTag && r.matched > 0 && <TagAgreement r={r} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <ByTag title={t("Missing on the site — by the file's tag")} rows={r.onlyFileByTag} empty={t("without a tag")} total={r.onlyFile.length} />
        <ByTag title={t("Missing in the file — by the site's channel")} rows={r.onlySiteByTag} empty="direct" total={r.onlySite.length} />
      </div>
      {hasTag && r.pairs.length > 0 && <Pairs r={r} />}
      <ByDay r={r} />
      <People r={r} />
    </div>
  );
}

function TagAgreement({ r }: { r: Reconciliation }) {
  const t = useT();
  const num = useNum();
  const rows: [string, number, string][] = [
    [t("Same tag"), r.tags.same, "bg-leads"],
    [t("No tag in either"), r.tags.bothEmpty, "bg-leads/60"],
    [t("Tag in the file, direct on the site"), r.tags.fileOnly, "bg-amber-400"],
    [t("No tag in the file, a channel on the site"), r.tags.siteOnly, "bg-accent"],
    [t("Different tags"), r.tags.different, "bg-danger"],
  ];
  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold">{t("Tags of the people in both")}</h2>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {rows.map(([label, n, tone]) => (
            <tr key={label} className="border-b border-line/60">
              <td className="py-2 pr-3">{label}</td>
              <td className="py-2 text-right"><Bar n={n} of={r.matched} tone={tone} /></td>
              <td className="num w-16 py-2 text-right">{num(n)}</td>
              <td className="num w-14 py-2 text-right text-ink-muted">{pct(n, r.matched)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ByTag({ title, rows, empty, total }: { title: string; rows: { tag: string; n: number }[]; empty: string; total: number }) {
  const t = useT();
  const num = useNum();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {!rows.length ? <p className="mt-3 text-sm text-ink-faint">{t("Nobody.")}</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {shown.map((x) => (
                <tr key={x.tag} className="border-b border-line/60">
                  <td className={cn("break-words py-2 pr-3", !x.tag && "text-ink-muted")}>{x.tag || empty}</td>
                  <td className="py-2 text-right"><Bar n={x.n} of={total} /></td>
                  <td className="num w-12 py-2 text-right">{num(x.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > shown.length && <button type="button" className="btn-ghost mt-3" onClick={() => setAll(true)}>{t("Show more")}</button>}
        </div>
      )}
    </section>
  );
}

function Pairs({ r }: { r: Reconciliation }) {
  const t = useT();
  const num = useNum();
  const [all, setAll] = useState(false);
  const shown = all ? r.pairs : r.pairs.slice(0, 12);
  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold">{t("Where the tags differ")}</h2>
      <p className="mt-1 text-xs text-ink-faint">{t("The same person: the tag in the file and the channel the site gave them.")}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="pb-2 font-medium">{t("In the file")}</th>
              <th className="pb-2 font-medium">{t("On the site")}</th>
              <th className="pb-2 text-right font-medium">{t("People")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={`${p.fileTag}\u0000${p.siteTag}`} className="border-b border-line/60">
                <td className={cn("break-words py-2 pr-3", !p.fileTag && "text-ink-muted")}>{p.fileTag || t("without a tag")}</td>
                <td className={cn("break-words py-2 pr-3", !p.siteTag && "text-ink-muted")}>{p.siteTag || "direct"}</td>
                <td className="num py-2 text-right">{num(p.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.pairs.length > shown.length && <button type="button" className="btn-ghost mt-3" onClick={() => setAll(true)}>{t("Show more")}</button>}
    </section>
  );
}

function ByDay({ r }: { r: Reconciliation }) {
  const t = useT();
  const num = useNum();
  if (!r.byDay.length) return null;
  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold">{t("By day")}</h2>
      <p className="mt-1 text-xs text-ink-faint">{t("People by the day of their first registration. A day with low coverage shows when the site lost registrations.")}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="pb-2 font-medium">{t("Day")}</th>
              <th className="pb-2 text-right font-medium">{t("In the file")}</th>
              <th className="pb-2 text-right font-medium">{t("On the site")}</th>
              <th className="pb-2 text-right font-medium">{t("In both")}</th>
              <th className="pb-2 text-right font-medium">{t("Coverage")}</th>
            </tr>
          </thead>
          <tbody>
            {r.byDay.map((d) => (
              <tr key={d.day} className="border-b border-line/60">
                <td className="num py-2 pr-3">{d.day}</td>
                <td className="num py-2 text-right">{num(d.file)}</td>
                <td className="num py-2 text-right">{num(d.site)}</td>
                <td className="num py-2 text-right text-leads">{num(d.matched)}</td>
                <td className="py-2 text-right">
                  <span className="inline-flex items-center gap-2"><Bar n={d.matched} of={d.file} tone="bg-leads" /><span className="num w-10 text-right">{pct(d.matched, d.file)}</span></span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const PAGE = 100;
type Tab = "onlyFile" | "onlySite" | "tagDiffs";

function People({ r }: { r: Reconciliation }) {
  const t = useT();
  const num = useNum();
  const [tab, setTab] = useState<Tab>("onlyFile");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const rows = useMemo(() => {
    const all: { contact: string; at: string; a: string; b: string }[] =
      tab === "onlyFile" ? r.onlyFile.map((p) => ({ contact: p.contact, at: p.at ?? "", a: p.tag, b: "" }))
      : tab === "onlySite" ? r.onlySite.map((p) => ({ contact: p.contact, at: p.at, a: "", b: p.tag || "direct" }))
      : r.tagDiffs.map((p) => ({ contact: p.contact, at: p.at ?? "", a: p.fileTag, b: p.siteTag || "direct" }));
    const s = q.trim().toLowerCase();
    return s ? all.filter((x) => [x.contact, x.a, x.b].some((v) => v.toLowerCase().includes(s))) : all;
  }, [r, tab, q]);

  function exportCsv() {
    const cell = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [["Contact", "Registered", "Tag in the file", "Channel on the site"], ...rows.map((x) => [x.contact, x.at, x.a, x.b])];
    const blob = new Blob(["﻿" + lines.map((l) => l.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `registration-check-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const tabs: [Tab, string, number][] = [
    ["onlyFile", t("Only in the file"), r.onlyFile.length],
    ["onlySite", t("Only on the site"), r.onlySite.length],
    ["tagDiffs", t("Tags differ"), r.tagDiffs.length],
  ];
  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold">{t("Who exactly")}</h2>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-line bg-bg-raised p-1" role="tablist">
          {tabs.map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setShown(PAGE); }}
              className={cn("rounded-full px-3 py-1.5 text-sm transition", tab === k ? "bg-bg-hover font-medium text-ink" : "text-ink-muted hover:text-ink")}>
              {label} <span className="num text-ink-faint">{num(n)}</span>
            </button>
          ))}
        </div>
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder={t("Search: e-mail, tag")} className="input max-w-xs flex-1" />
        <button type="button" onClick={exportCsv} className="btn-ghost" disabled={!rows.length}>{t("Export CSV")}</button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="pb-2 font-medium">{t("Contact")}</th>
              <th className="pb-2 font-medium">{t("Registered")}</th>
              <th className="pb-2 font-medium">{t("Tag in the file")}</th>
              <th className="pb-2 font-medium">{t("Channel on the site")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((x, i) => (
              <tr key={i} className="border-b border-line/60">
                <td className="break-words py-2 pr-3">{x.contact}</td>
                <td className="num py-2 pr-3 text-ink-muted">{x.at || "—"}</td>
                <td className="break-words py-2 pr-3 text-ink-muted">{tab === "onlySite" ? "—" : x.a || t("without a tag")}</td>
                <td className="break-words py-2 text-ink-muted">{tab === "onlyFile" ? "—" : x.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="mt-3 text-sm text-ink-faint">{t("Nobody.")}</p>}
      {rows.length > shown && <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn-ghost mt-4">{t("Show more")}</button>}
    </section>
  );
}

function WhyTheyDiffer() {
  const t = useT();
  return (
    <section className="card p-5 text-sm leading-relaxed text-ink-muted">
      <h2 className="font-display text-base font-semibold text-ink">{t("Why the numbers differ")}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li><b className="text-ink">{t("No tag in the form's export")}</b> — {t("the person opened the form without UTM in the address: typed it, found it in search, or got a link from a teammate or a friend. The site counts such people as direct.")}</li>
        <li><b className="text-ink">{t("Only in the file")}</b> — {t("the site sees a registration only if its script ran in the person's browser and saw the thank-you screen: an ad blocker, a closed tab or a slow send means no lead. A direct registration is also skipped when the script could not read an e-mail or phone, and after 10 from one network in an hour.")}</li>
        <li><b className="text-ink">{t("Only on the site")}</b> — {t("leads after the export was made, test sends, or a different e-mail in the form and on the site.")}</li>
        <li><b className="text-ink">{t("Different tags")}</b> — {t("the site keeps the link's tags for a day and trusts the link a person came through; the form may remember an earlier or a later visit.")}</li>
        <li>{t("Repeat sends: the form keeps every one, the site merges repeats from one visit. Here both are counted as people.")}</li>
      </ul>
    </section>
  );
}
