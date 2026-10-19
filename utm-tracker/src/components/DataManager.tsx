"use client";

import { useState } from "react";
import { Portal } from "@/components/ui/Portal";
import { useRouter } from "next/navigation";

type Campaign = { id: string; name: string; label: string | null };
type Stats = { clicks: number; leads: number; links: number; campaigns: number; webhookLogs: number };
type PendingAction = { target: string; label: string };

const DANGER_ACTIONS = [
  { target: "clicks", label: "All clicks",       desc: "Delete every click event across all links",         icon: "🖱️" },
  { target: "leads",  label: "All leads",        desc: "Delete every lead submission",                      icon: "👤" },
  { target: "links",  label: "All links + data", desc: "Delete all tracking links, their clicks and leads", icon: "🔗" },
  { target: "all",    label: "Everything",       desc: "Full reset — delete all data including campaigns",  icon: "💣" },
];

export function DataManager({ stats, campaigns }: { stats: Stats; campaigns: Campaign[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [confirmText, setConfirmText] = useState<string>("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  async function execute(target: string, campaignId?: string) {
    setLoading(target + (campaignId ?? ""));
    try {
      await fetch("/api/admin", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, campaignId: campaignId || null }),
      });
      router.refresh();
    } finally {
      setLoading(null);
      setPendingAction(null);
      setConfirmText("");
    }
  }

  function ask(target: string, label: string) {
    setPendingAction({ target, label });
    setConfirmText("");
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Current data</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Clicks",       value: stats.clicks },
            { label: "Leads",        value: stats.leads },
            { label: "Links",        value: stats.links },
            { label: "Campaigns",    value: stats.campaigns },
            { label: "Webhook logs", value: stats.webhookLogs },
          ].map((s) => (
            <div key={s.label} className="card p-4">
              <div className="text-2xl font-bold text-ink">{s.value.toLocaleString()}</div>
              <div className="mt-1 text-xs text-ink-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-display text-lg font-semibold">Delete by campaign</h2>
        <p className="mb-3 text-sm text-ink-muted">Remove clicks or leads for a specific campaign only.</p>
        <div className="card p-5 space-y-4">
          <div>
            <label className="label">Select campaign</label>
            <select className="input max-w-sm" value={selectedCampaign} onChange={(e) => setSelectedCampaign(e.target.value)}>
              <option value="">— pick a campaign —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.name}>{c.label || c.name}</option>
              ))}
            </select>
          </div>
          {selectedCampaign && (
            <div className="flex flex-wrap gap-3">
              <button className="btn-ghost border border-line text-sm hover:border-danger hover:text-danger" disabled={!!loading} onClick={() => ask(`clicks_campaign_${selectedCampaign}`, `clicks for "${selectedCampaign}"`)}>Delete clicks</button>
              <button className="btn-ghost border border-line text-sm hover:border-danger hover:text-danger" disabled={!!loading} onClick={() => ask(`leads_campaign_${selectedCampaign}`, `leads for "${selectedCampaign}"`)}>Delete leads</button>
              <button className="btn-ghost border border-line text-sm hover:border-danger hover:text-danger" disabled={!!loading} onClick={() => ask(`links_campaign_${selectedCampaign}`, `all links & data for "${selectedCampaign}"`)}>Delete links + data</button>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-display text-lg font-semibold">Global delete</h2>
        <p className="mb-3 text-sm text-ink-muted">These actions affect all data regardless of campaign.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {DANGER_ACTIONS.map((a) => (
            <div key={a.target} className="card p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{a.icon}</span>
                <div>
                  <p className="font-medium text-ink">{a.label}</p>
                  <p className="text-xs text-ink-faint">{a.desc}</p>
                </div>
              </div>
              <button onClick={() => ask(a.target, a.label)} disabled={!!loading} className="shrink-0 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger hover:text-white">
                {loading === a.target ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {pendingAction && (
        <Portal>
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 shadow-2xl space-y-4">
            <p className="font-display text-lg font-semibold text-ink">Confirm deletion</p>
            <p className="text-sm text-ink-muted">
              You are about to delete <span className="font-medium text-danger">{pendingAction.label}</span>. This cannot be undone.
            </p>
            <div>
              <label className="label">Type <span className="font-mono text-ink">DELETE</span> to confirm</label>
              <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoFocus />
            </div>
            <div className="flex gap-3 justify-end">
              <button className="btn-ghost" onClick={() => { setPendingAction(null); setConfirmText(""); }}>Cancel</button>
              <button
                disabled={confirmText !== "DELETE" || !!loading}
                onClick={() => {
                  const t = pendingAction.target;
                  if (t.startsWith("clicks_campaign_"))     execute("clicks", t.replace("clicks_campaign_", ""));
                  else if (t.startsWith("leads_campaign_")) execute("leads",  t.replace("leads_campaign_",  ""));
                  else if (t.startsWith("links_campaign_")) execute("links",  t.replace("links_campaign_",  ""));
                  else execute(t);
                }}
                className="rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:opacity-90 transition"
              >
                {loading ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
