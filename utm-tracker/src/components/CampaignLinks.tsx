"use client";

import { useState } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/ui/CopyButton";
import { EditLinkDialog } from "@/components/EditLinkDialog";

export interface CampaignLinkRow {
  id: string;
  label: string;
  slug: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmContent: string | null;
  destinationUrl: string;
  clicks: number;
  leads: number;
}

/** The campaign's ready links: short URL to hand out, with clicks and leads; copy all or download CSV. */
export function CampaignLinks({ rows, base, file, createHref, editable = false }: { rows: CampaignLinkRow[]; base: string; file: string; createHref: string | null; editable?: boolean }) {
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const short = (slug: string) => `${base}/r/${slug}`;

  async function copyAll() {
    const text = rows.map((r) => `${r.label} — ${short(r.slug)}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setInfo("All links copied");
    } catch {
      setInfo("Could not copy: select the links in the table");
    }
  }

  function downloadCsv() {
    const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["name", "utm_source", "utm_medium", "utm_content", "short_url", "destination", "clicks", "leads"].join(",")];
    for (const r of rows) lines.push([r.label, r.utmSource, r.utmMedium, r.utmContent, short(r.slug), r.destinationUrl, r.clicks, r.leads].map(esc).join(","));
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file}-utm-links.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card mt-6 overflow-hidden">
      {editing && <EditLinkDialog id={editing} onClose={() => setEditing(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <h2 className="font-display text-lg font-semibold">Links <span className="text-sm font-normal text-ink-faint">{rows.length}</span></h2>
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {info && <span className="text-xs text-leads">{info}</span>}
            <button type="button" className="btn-ghost border border-line text-sm" onClick={copyAll}>Copy all</button>
            <button type="button" className="btn-ghost border border-line text-sm" onClick={downloadCsv}>Download CSV</button>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-ink-faint">
          No links yet.{" "}
          {createHref && <Link href={createHref} className="text-accent hover:underline">Create UTM links →</Link>}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-6 py-3 font-medium">Link</th>
                <th className="px-6 py-3 font-medium">Short URL</th>
                <th className="px-6 py-3 font-medium">Source · content</th>
                <th className="px-6 py-3 text-right font-medium">Clicks</th>
                <th className="px-6 py-3 text-right font-medium">Leads</th>
                {editable && <th className="px-6 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-bg-hover/40">
                  <td className="px-6 py-3 text-ink">{r.label}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-accent">{short(r.slug)}</span>
                      <CopyButton value={short(r.slug)} />
                    </div>
                  </td>
                  <td className="px-6 py-3 text-xs text-ink-muted">{[r.utmSource, r.utmContent || r.utmMedium].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="num px-6 py-3 text-right text-ink">{r.clicks}</td>
                  <td className="num px-6 py-3 text-right text-leads">{r.leads}</td>
                  {editable && (
                    <td className="px-6 py-3 text-right">
                      <button type="button" onClick={() => setEditing(r.id)} className="text-xs font-medium text-accent hover:opacity-80">Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
