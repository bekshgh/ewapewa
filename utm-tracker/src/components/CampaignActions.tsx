"use client";

import { useState } from "react";
import { Portal } from "@/components/ui/Portal";
import { useRouter } from "next/navigation";

export function CampaignActions({ id, status, canDelete }: { id: string; status: string; canDelete: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");

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
      <div className="flex items-center gap-2">
        {status === "active" && (
          <button
            onClick={() => patch("stopped")}
            disabled={!!loading}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-accent hover:text-accent"
          >
            {loading === "stopped" ? "Stopping…" : "⏸ Stop campaign"}
          </button>
        )}
        {status === "stopped" && (
          <button
            onClick={() => patch("active")}
            disabled={!!loading}
            className="rounded-xl border border-leads/40 px-4 py-2 text-sm font-medium text-leads transition hover:bg-leads hover:text-white"
          >
            {loading === "active" ? "Activating…" : "▶ Activate"}
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

      {confirmDelete && (
        <Portal>
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 shadow-2xl space-y-4">
            <p className="font-display text-lg font-semibold text-ink">Delete campaign?</p>
            <p className="text-sm text-ink-muted">
              This will permanently delete the campaign and <span className="text-danger font-medium">all its links, clicks and leads</span>. Cannot be undone.
            </p>
            <div>
              <label className="label">Type <span className="font-mono text-ink">DELETE</span> to confirm</label>
              <input
                className="input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button
                disabled={confirmText !== "DELETE" || loading === "delete"}
                onClick={deleteCampaign}
                className="rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:opacity-90 transition"
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
