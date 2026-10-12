"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Summary = {
  sheet: string;
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

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

/** Upload a landing page's registrations sheet and turn its rows into leads (see lib/registrationImport). */
export function RegistrationImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);

  async function run(mode: "check" | "import") {
    if (!file) return;
    setBusy(mode);
    setError(null);
    if (mode === "check") setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("mode", mode);
      const res = await fetch("/api/admin/registrations", { method: "POST", body });
      const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
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

  const s = result ?? check;

  return (
    <section>
      <h2 className="mb-1 font-display text-lg font-semibold">Import registrations from a spreadsheet</h2>
      <p className="mb-3 text-sm text-ink-muted">
        For a landing page whose form never sent leads here: upload its registrations sheet (.xlsx, e.g. downloaded from
        Google Sheets). Each row becomes a lead dated by its own timestamp. Rows with a <code>click_id</code> in the page
        address are tied to the exact click; the rest are matched by UTM. Uploading the same file again adds nothing.
      </p>
      <div className="card space-y-4 p-5">
        <input
          type="file"
          accept=".xlsx"
          className="block text-sm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setCheck(null);
            setResult(null);
            setError(null);
          }}
        />

        <div className="flex flex-wrap gap-3">
          <button className="btn-ghost border border-line text-sm" disabled={!file || !!busy} onClick={() => run("check")}>
            {busy === "check" ? "Checking…" : "1. Check"}
          </button>
          <button
            className="btn-primary text-sm"
            disabled={!file || !check || check.created === 0 || !!result || !!busy}
            onClick={() => run("import")}
          >
            {busy === "import" ? "Importing…" : `2. Import ${check ? check.created.toLocaleString() : ""} leads`}
          </button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {s && (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-ink">
              {result
                ? `Import finished: ${result.created.toLocaleString()} leads added.`
                : `Sheet «${s.sheet}»: ${s.rows.toLocaleString()} registrations, ${day(s.dateFrom)} – ${day(s.dateTo)}.`}
            </p>
            <ul className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-1">
              {[
                [result ? "Added" : "Will be added", s.created],
                ["Already imported before", s.alreadyImported],
                ["Exact (by click_id)", s.exact],
                ["Estimated (by UTM)", s.estimated],
                ["Not attributed", s.unknown],
                ["Different people (by email/phone)", s.uniquePeople],
                ["Rows skipped (no date or contact)", s.skipped],
                ["click_id not among recorded clicks", s.clickNotFound],
              ].map(([label, n]) => (
                <li key={label as string} className="flex justify-between gap-3">
                  <span className="text-ink-muted">{label}</span>
                  <span className="font-mono text-ink">{(n as number).toLocaleString()}</span>
                </li>
              ))}
            </ul>
            {s.byCampaign.length > 0 && (
              <div>
                <p className="mb-1 text-ink-muted">By utm_campaign:</p>
                <ul className="max-w-xl space-y-0.5">
                  {s.byCampaign.map((c) => (
                    <li key={c.campaign} className="flex justify-between gap-3">
                      <span className="truncate text-ink">{c.campaign}</span>
                      <span className="font-mono text-ink">{c.leads.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.clickNotFound > 0 && (
              <p className="hint">
                Some click_ids are not in this tracker&apos;s clicks (e.g. the old data was not imported yet). Those rows
                are matched by UTM instead. Import the old tracker first, then upload this file — rows already added are
                not duplicated, but they keep their first attribution.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
