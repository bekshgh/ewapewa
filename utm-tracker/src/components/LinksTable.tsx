"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/ui/CopyButton";
import { EditLinkDialog } from "@/components/EditLinkDialog";
import { Portal } from "@/components/ui/Portal";
import { formatNumber, relativeTime } from "@/lib/utils";
import { shortUrl } from "@/lib/linkDomains";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "";
const PAGE = 50; // rows shown at a time

export type LinkRow = {
  id: string;
  name: string;
  slug: string;
  /** null = the main domain */
  shortDomain: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmContent: string | null;
  campaignName: string | null;
  clicks: number;
  leads: number;
  cr: number;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  /** The viewer may pause, archive or delete it. */
  editable: boolean;
};

/** QR made in the browser (no third-party service sees the links): PNG 1024 px and SVG for print. */
function QRModal({ url, slug, onClose }: { url: string; slug: string; onClose: () => void }) {
  const [png, setPng] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const opts = { margin: 2, errorCorrectionLevel: "M" as const, color: { dark: "#000000", light: "#ffffff" } };
    Promise.all([QRCode.toDataURL(url, { ...opts, width: 1024 }), QRCode.toString(url, { ...opts, type: "svg" })])
      .then(([p, s]) => { if (!stop) { setPng(p); setSvg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`); } })
      .catch(() => {});
    return () => { stop = true; };
  }, [url]);
  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card flex flex-col items-center gap-4 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-ink">QR Code</p>
        {png ? <img src={png} alt="QR code" width={220} height={220} className="rounded-xl" /> : <div className="h-[220px] w-[220px] animate-pulse rounded-xl bg-bg-hover" />}
        <p className="max-w-[240px] break-all text-center text-xs text-ink-faint">{url}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {png && <a href={png} download={`qr-${slug}.png`} className="btn-ghost border border-line text-xs">PNG 1024 px</a>}
          {svg && <a href={svg} download={`qr-${slug}.svg`} className="btn-ghost border border-line text-xs" title="Vector: any size for print">SVG (print)</a>}
          <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

export function LinksTable({ links }: { links: LinkRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [campaign, setCampaign] = useState("");
  const [source, setSource] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [qr, setQr] = useState<{ url: string; slug: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const campaigns = useMemo(() => Array.from(new Set(links.map((l) => l.campaignName).filter(Boolean))) as string[], [links]);
  const sources = useMemo(() => Array.from(new Set(links.map((l) => l.utmSource).filter(Boolean))) as string[], [links]);
  const archivedCount = links.filter((l) => l.isArchived).length;

  const filtered = links.filter((l) => {
    if (!showArchived && l.isArchived) return false;
    if (q && !`${l.name} ${l.slug} ${l.utmContent ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (campaign && l.campaignName !== campaign) return false;
    if (source && l.utmSource !== source) return false;
    return true;
  });

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/links/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this link and all its click data? This cannot be undone.")) return;
    await fetch(`/api/links/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      {qr && <QRModal url={qr.url} slug={qr.slug} onClose={() => setQr(null)} />}
      {editing && <EditLinkDialog id={editing} onClose={() => setEditing(null)} />}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Search links…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[180px]" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="">All campaigns</option>
          {campaigns.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input max-w-[160px]" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {sources.map((s) => <option key={s}>{s}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-accent" />
          Show archived ({archivedCount})
        </label>
        <Link href="/links/new" className="btn-primary ml-auto">+ Create link</Link>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3.5 font-medium">Description</th>
                <th className="px-5 py-3.5 font-medium">Short URL</th>
                <th className="px-5 py-3.5 font-medium">Campaign / source</th>
                <th className="px-5 py-3.5 text-right font-medium">Clicks</th>
                <th className="px-5 py-3.5 text-right font-medium">Leads</th>
                <th className="px-5 py-3.5 text-right font-medium">CR%</th>
                <th className="px-5 py-3.5 font-medium">Created</th>
                <th className="px-5 py-3.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-ink-faint">No links match your filters.</td></tr>
              )}
              {filtered.slice(0, limit).map((l) => {
                const fullUrl = shortUrl(BASE, l.slug, l.shortDomain);
                return (
                  <tr key={l.id} className={`transition hover:bg-bg-hover/50 ${l.isArchived ? "opacity-50" : ""}`}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-ink">{l.name}</p>
                      {l.utmContent && <p className="text-xs text-ink-faint">{l.utmContent}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-clicks" title={fullUrl}>{l.shortDomain && <span className="text-ink-faint">{l.shortDomain}</span>}/r/{l.slug}</span>
                        <CopyButton value={fullUrl} />
                        <button
                          type="button"
                          onClick={() => setQr({ url: fullUrl, slug: l.slug })}
                          className="inline-flex items-center rounded-md border border-line bg-bg-raised px-2 py-0.5 text-xs font-medium text-ink-muted transition hover:border-accent hover:text-accent"
                          title="Show QR code"
                        >
                          QR
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-ink-muted">
                      <span className="text-ink">{l.campaignName || "—"}</span>
                      <span className="text-ink-faint"> / {l.utmSource || "—"} / {l.utmMedium || "—"}</span>
                    </td>
                    <td className="num px-5 py-3.5 text-right text-ink">{formatNumber(l.clicks)}</td>
                    <td className="num px-5 py-3.5 text-right text-leads">{formatNumber(l.leads)}</td>
                    <td className="num px-5 py-3.5 text-right text-ink-muted">{l.clicks ? `${l.cr.toFixed(1)}%` : "—"}</td>
                    <td className="px-5 py-3.5 text-xs text-ink-faint">{relativeTime(l.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-3 text-xs">
                        <a href={fullUrl} target="_blank" rel="noreferrer" className="text-ink-faint hover:text-ink">Open</a>
                        {l.editable && (
                          <>
                            <button onClick={() => setEditing(l.id)} className="font-medium text-accent hover:opacity-80">Edit</button>
                            <button onClick={() => patch(l.id, { isActive: !l.isActive })} className="text-ink-faint hover:text-ink">
                              {l.isActive ? "Pause" : "Resume"}
                            </button>
                            <button onClick={() => patch(l.id, { isArchived: !l.isArchived })} className="text-ink-faint hover:text-ink">
                              {l.isArchived ? "Restore" : "Archive"}
                            </button>
                            <button onClick={() => remove(l.id)} className="text-danger hover:opacity-80">Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-ink-muted">
            <span>Showing {limit} of {filtered.length}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost border border-line" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, filtered.length - limit)} more</button>
              <button type="button" className="btn-ghost" onClick={() => setLimit(filtered.length)}>Show all</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
