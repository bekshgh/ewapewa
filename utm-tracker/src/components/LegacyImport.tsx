"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang, useT } from "@/lib/i18n/client";

type Count = { table: string; rows: number };
type TableResult = { table: string; found: number; imported: number; merged: number };
type Result = { tables: TableResult[]; formSubmitsAsLeads?: number };

const LABELS: Record<string, string> = {
  User: "Users",
  Campaign: "Campaigns",
  TrackingLink: "Links",
  ClickEvent: "Clicks",
  Lead: "Leads",
  FormSubmit: "Form submits (become leads)",
  WebhookLog: "Webhook logs",
  AppSetting: "Settings",
  ProjectType: "Project types",
  Project: "Projects",
  ProjectMetrics: "Project metrics",
  Report: "Reports",
  ThemeMapping: "Report themes",
  SavedView: "Saved views",
};

/** Copies all data from a previous deployment of this tracker (see lib/legacyImport). */
export function LegacyImport() {
  const t = useT();
  const lang = useLang();
  const num = (n: number) => n.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Count[] | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(mode: "check" | "import") {
    setBusy(mode);
    setError(null);
    if (mode === "check") setResult(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mode }),
      });
      const data = await res.json().catch(() => ({ error: t("Request failed ({status})", { status: res.status }) }));
      if (!res.ok) throw new Error(data.error ?? t("Request failed ({status})", { status: res.status }));
      if (mode === "check") setCounts(data.tables);
      else {
        setResult(data);
        setUrl("");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="mb-1 font-display text-lg font-semibold">{t("Import from a previous tracker")}</h2>
      <p className="mb-3 text-sm text-ink-muted">
        {t("Copies links, clicks, leads, campaigns, webhook logs, reports and projects from another deployment of this tracker. The old site is only read. Running it again is safe: nothing is copied twice.")}
      </p>
      <div className="card space-y-4 p-5">
        <div>
          <label className="label">{t("Old site's database address")}</label>
          <input
            className="input font-mono text-xs"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="postgresql://…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setCounts(null);
            }}
          />
          <p className="hint mt-1">
            {t("In the old project on Vercel: Settings → Environment Variables →")} <code>DATABASE_URL</code>. {t("Used once, never stored.")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button className="btn-ghost border border-line text-sm" disabled={!url || !!busy} onClick={() => run("check")}>
            {busy === "check" ? t("Checking…") : "1. " + t("Check")}
          </button>
          <button className="btn-primary text-sm" disabled={!url || !counts || !!busy} onClick={() => run("import")}>
            {busy === "import" ? t("Importing… (can take a minute)") : "2. " + t("Import everything")}
          </button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {counts && !result && (
          <div>
            <p className="mb-2 text-sm text-ink-muted">{t("Found on the old site:")}</p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {counts.map((c) => (
                <li key={c.table} className="flex justify-between gap-3">
                  <span className="text-ink-muted">{LABELS[c.table] ? t(LABELS[c.table]) : c.table}</span>
                  <span className="font-mono text-ink">{num(c.rows)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{t("Import finished.")}</p>
            <table className="w-full max-w-lg text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-faint">
                  <th className="py-1 font-normal">{t("Data")}</th>
                  <th className="py-1 text-right font-normal">{t("On old site")}</th>
                  <th className="py-1 text-right font-normal">{t("Newly copied")}</th>
                </tr>
              </thead>
              <tbody>
                {result.tables.map((x) => (
                  <tr key={x.table} className="border-t border-line">
                    <td className="py-1 text-ink-muted">
                      {LABELS[x.table] ? t(LABELS[x.table]) : x.table}
                      {x.merged > 0 && <span className="text-ink-faint"> ({t("{n} merged with existing", { n: x.merged })})</span>}
                    </td>
                    <td className="py-1 text-right font-mono">{num(x.found)}</td>
                    <td className="py-1 text-right font-mono text-ink">{num(x.imported)}</td>
                  </tr>
                ))}
                {result.formSubmitsAsLeads !== undefined && (
                  <tr className="border-t border-line">
                    <td className="py-1 text-ink-muted">{t("Form submits → leads")}</td>
                    <td />
                    <td className="py-1 text-right font-mono text-ink">{num(result.formSubmitsAsLeads)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="hint mt-2">
              {t("“Newly copied” is lower than the total when some rows were already here, for example after an earlier run.")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
