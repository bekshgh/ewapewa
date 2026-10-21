"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang, useT } from "@/lib/i18n/client";

type Summary = {
  sheet: string;
  totalRows: number;
  cities: { city: string; rows: number }[];
  filteredOut: number;
  duplicatesRemoved: number;
  rows: number;
  skipped: number;
  dateFrom: string | null;
  dateTo: string | null;
  uniquePeople: number;
  exact: number;
  estimated: number;
  unknown: number;
  clickNotFound: number;
  alreadyImported: number;
  created: number;
  byCampaign: { campaign: string; leads: number }[];
};

type Options = { city: string; onePerPerson: boolean };


/** Upload a landing page's registrations sheet and turn its rows into leads (see lib/registrationImport). */
export function RegistrationImport() {
  const t = useT();
  const lang = useLang();
  const loc = lang === "ru" ? "ru-RU" : "en-GB";
  const num = (n: number) => n.toLocaleString(loc);
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(loc, { timeZone: "Asia/Almaty" }) : "—");
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [opts, setOpts] = useState<Options>({ city: "", onePerPerson: true });
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);

  async function run(mode: "check" | "import", o: Options = opts) {
    if (!file) return;
    setBusy(mode);
    setError(null);
    if (mode === "check") setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("mode", mode);
      if (o.city) body.append("city", o.city);
      if (o.onePerPerson) body.append("onePerPerson", "1");
      const res = await fetch("/api/admin/registrations", { method: "POST", body });
      const data = await res.json().catch(() => ({ error: t("Request failed ({status})", { status: res.status }) }));
      if (!res.ok) throw new Error(data.error ?? t("Request failed ({status})", { status: res.status }));
      if (mode === "check") setCheck(data);
      else {
        setResult(data);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function change(next: Partial<Options>) {
    const o = { ...opts, ...next };
    setOpts(o);
    void run("check", o);
  }

  const s = result ?? check;

  return (
    <section>
      <h2 className="mb-1 font-display text-lg font-semibold">{t("Import registrations from a spreadsheet")}</h2>
      <p className="mb-3 text-sm text-ink-muted">
        {t("For a landing page whose form never sent leads here: upload its registrations sheet (.xlsx, e.g. downloaded from Google Sheets). Each selected row becomes a lead dated by its own timestamp. Rows with a click_id in the page address are tied to the exact click; the rest are matched by UTM. Uploading the same file again adds nothing.")}
      </p>
      <div className="card space-y-4 p-5">
        <input
          type="file"
          accept=".xlsx"
          className="block text-sm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setOpts({ city: "", onePerPerson: true });
            setCheck(null);
            setResult(null);
            setError(null);
          }}
        />

        {check && !result && (
          <div className="flex flex-wrap items-end gap-6 text-sm">
            {check.cities.length > 0 && (
              <div>
                <label className="label">{t("City")}</label>
                <select className="input" value={opts.city} disabled={!!busy} onChange={(e) => change({ city: e.target.value })}>
                  <option value="">{t("All cities ({n})", { n: num(check.totalRows) })}</option>
                  {check.cities.map((c) => (
                    <option key={c.city} value={c.city}>
                      {c.city} ({num(c.rows)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={opts.onePerPerson}
                disabled={!!busy}
                onChange={(e) => change({ onePerPerson: e.target.checked })}
              />
              {t("One lead per person (keep the earliest registration)")}
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button className="btn-ghost border border-line text-sm" disabled={!file || !!busy} onClick={() => run("check")}>
            {busy === "check" ? t("Checking…") : "1. " + t("Check")}
          </button>
          <button
            className="btn-primary text-sm"
            disabled={!file || !check || check.created === 0 || !!result || !!busy}
            onClick={() => run("import")}
          >
            {busy === "import" ? t("Importing…") : "2. " + t("Import {n} leads", { n: check ? num(check.created) : "" })}
          </button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {s && (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-ink">
              {result
                ? t("Import finished: {n} leads added.", { n: num(result.created) })
                : t("Sheet «{sheet}»: {n} registrations, {from} – {to}. Selected: {sel}.", { sheet: s.sheet, n: num(s.totalRows), from: day(s.dateFrom), to: day(s.dateTo), sel: num(s.rows) })}
            </p>
            <ul className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-1">
              {[
                [result ? "Added" : "Will be added", s.created],
                ["Already imported before", s.alreadyImported],
                ["Exact (by click_id)", s.exact],
                ["Estimated (by UTM)", s.estimated],
                ["Not attributed", s.unknown],
                ["Left out by city filter", s.filteredOut],
                ["Repeat registrations dropped", s.duplicatesRemoved],
                ["Rows skipped (no date or contact)", s.skipped],
                ["click_id not among recorded clicks", s.clickNotFound],
              ].map(([label, n]) => (
                <li key={label as string} className="flex justify-between gap-3">
                  <span className="text-ink-muted">{t(label as string)}</span>
                  <span className="font-mono text-ink">{num(n as number)}</span>
                </li>
              ))}
            </ul>
            {s.byCampaign.length > 0 && (
              <div>
                <p className="mb-1 text-ink-muted">{t("By utm_campaign:")}</p>
                <ul className="max-w-xl space-y-0.5">
                  {s.byCampaign.map((c) => (
                    <li key={c.campaign} className="flex justify-between gap-3">
                      <span className="truncate text-ink">{c.campaign}</span>
                      <span className="font-mono text-ink">{num(c.leads)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.clickNotFound > 0 && (
              <p className="hint">
                {t("Some click_ids are not in this tracker's clicks (e.g. the old data was not imported yet). Those rows are matched by UTM instead. Import the old tracker first, then upload this file — rows already added are not duplicated, but they keep their first attribution.")}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
