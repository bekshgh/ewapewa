"use client";

import { useState } from "react";
import { Portal } from "@/components/ui/Portal";
import { useRouter } from "next/navigation";
import { NameWithTerm } from "@/components/ui/NameWithTerm";

export interface CampaignEditable {
  name: string; // utm_campaign, shown read-only
  label: string | null;
  type: string | null;
  funnel: string | null;
  description: string | null;
}

const TYPES = ["Case-Championship", "Forum", "Hackathon"];

export function CampaignActions({ id, status, canDelete, campaign }: { id: string; status: string; canDelete: boolean; campaign: CampaignEditable }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [editing, setEditing] = useState(false);

  async function patch(newStatus: string) {
    setLoading(newStatus);
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setLoading(null);
    router.refresh();
  }

  async function deleteCampaign() {
    setLoading("delete");
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setLoading(null);
    router.push("/campaigns");
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEditing(true)} className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-accent hover:text-accent">
          ✎ Edit
        </button>
        {status === "active" && (
          <button
            onClick={() => patch("paused")}
            disabled={!!loading}
            title="Links keep opening the page, but clicks stop being counted"
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-accent hover:text-accent"
          >
            {loading === "paused" ? "Pausing…" : "⏸ Pause campaign"}
          </button>
        )}
        {status !== "active" && (
          <button
            onClick={() => patch("active")}
            disabled={!!loading}
            className="rounded-xl border border-leads/40 px-4 py-2 text-sm font-medium text-leads transition hover:bg-leads hover:text-white"
          >
            {loading === "active" ? "Resuming…" : "▶ Resume"}
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => { setConfirmDelete(true); setConfirmText(""); }}
            className="rounded-xl border border-danger/40 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger hover:text-white"
          >
            🗑 Delete campaign
          </button>
        )}
      </div>
      {status !== "active" && (
        <p className="mt-2 text-xs text-ink-faint">Paused: its links still open the page, but clicks are not counted.</p>
      )}

      {editing && <EditCampaign id={id} campaign={campaign} onClose={() => setEditing(false)} />}

      {confirmDelete && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="card w-full max-w-md space-y-4 p-6 shadow-2xl">
              <p className="font-display text-lg font-semibold text-ink">Delete campaign?</p>
              <p className="text-sm text-ink-muted">
                This will permanently delete the campaign and <span className="font-medium text-danger">all its links, clicks and leads</span>. Cannot be undone.
              </p>
              <div>
                <label className="label">Type <span className="font-mono text-ink">DELETE</span> to confirm</label>
                <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoFocus />
              </div>
              <div className="flex justify-end gap-3">
                <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button
                  disabled={confirmText !== "DELETE" || loading === "delete"}
                  onClick={deleteCampaign}
                  className="rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {loading === "delete" ? "Deleting…" : "Yes, delete everything"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

function EditCampaign({ id, campaign, onClose }: { id: string; campaign: CampaignEditable; onClose: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState(campaign.label ?? "");
  const [type, setType] = useState(campaign.type ?? "");
  const [funnel, setFunnel] = useState(campaign.funnel ?? "");
  const [description, setDescription] = useState(campaign.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!label) return setError("Enter the name and pick its term (F'26 / S'26).");
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, type: type || null, funnel: funnel || null, description: description || null }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(body.error ?? "Could not save");
    router.refresh();
    onClose();
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
        <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card w-full max-w-lg space-y-4 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="edit-campaign-title">
          <h2 id="edit-campaign-title" className="font-display text-lg font-semibold">Edit campaign</h2>
          <NameWithTerm id="ec-name" label="Campaign name" value={label} onChange={setLabel} />
          <div>
            <label className="label">utm_campaign</label>
            <p className="font-mono text-sm text-ink">{campaign.name}</p>
            <p className="hint">Not editable: the links and leads already carry this value.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ec-type">Type</label>
              <select id="ec-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">—</option>
                {[...new Set([...TYPES, ...(type ? [type] : [])])].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ec-funnel">Funnel / project</label>
              <input id="ec-funnel" className="input" maxLength={80} value={funnel} onChange={(e) => setFunnel(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ec-desc">Description</label>
            <input id="ec-desc" className="input" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
