"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pill } from "@/components/ui/Pill";

type Row = {
  id: string; name: string; label: string | null; description: string | null;
  funnel: string | null; season: string | null; type: string | null;
  status: string; linkCount: number;
};

export function CampaignManager({ campaigns, canCreate, editable }: { campaigns: Row[]; canCreate: boolean; editable: string[] }) {
  const canEdit = new Set(editable);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", label: "", description: "", funnel: "", season: "", type: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [patching, setPatching] = useState<string | null>(null);

  async function add() {
    if (!form.name.trim()) { setError("A campaign name is required"); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, status: "active" }),
    });
    setSaving(false);
    if (res.ok) { setForm({ name: "", label: "", description: "", funnel: "", season: "", type: "" }); setOpen(false); router.refresh(); }
    else {
      const err = (await res.json().catch(() => null))?.error;
      setError(res.status === 403 && err ? err : "Could not save. Check the campaign name is unique and valid.");
    }
  }

  async function patch(id: string, status: string) {
    setPatching(id + status);
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setPatching(null);
    router.refresh();
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      {canCreate && (
        <div className="mb-5">
          <button className="btn-primary" onClick={() => setOpen((v) => !v)}>{open ? "Close" : "+ Add campaign"}</button>
        </div>
      )}

      {open && (
        <div className="card mb-6 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="utm_campaign value *" hint="Lowercase, no spaces — e.g. icy_s26">
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="icy_s26" />
            </Field>
            <Field label="Display label" hint="Human-friendly name — ICY S'26">
              <input className="input" value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="ICY S'26" />
            </Field>
            <Field label="Funnel / project"><input className="input" value={form.funnel} onChange={(e) => set("funnel", e.target.value)} placeholder="Projects" /></Field>
            <Field label="Term"><input className="input" value={form.season} onChange={(e) => set("season", e.target.value)} placeholder="spring 2026" /></Field>
            <Field label="Type">
              <select className="input" value={form.type} onChange={(e) => set("type", e.target.value)}>
                <option value="">Select type…</option>
                <option>Case-Championship</option><option>Forum</option><option>Hackathon</option>
              </select>
            </Field>
            <Field label="Description"><input className="input" value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
          </div>
          {error && <p className="hint text-danger">{error}</p>}
          <button className="btn-primary mt-5" disabled={saving} onClick={add}>{saving ? "Saving…" : "Save campaign"}</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3.5 font-medium">Name</th>
                <th className="px-5 py-3.5 font-medium">Funnel</th>
                <th className="px-5 py-3.5 font-medium">Term</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 text-right font-medium">Links</th>
                <th className="px-5 py-3.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {campaigns.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-faint">No campaigns yet.</td></tr>}
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-bg-hover/40">
                  <td className="px-5 py-3.5">
                    <Link href={`/campaigns/${c.id}`} className="group flex items-center gap-2">
                      {c.type && <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs text-accent">{c.type}</span>}
                      <span className="font-medium text-ink group-hover:text-accent transition">{c.label || c.name}</span>
                      <span className="text-xs text-ink-faint">{c.name}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-ink-muted">{c.funnel || "—"}</td>
                  <td className="px-5 py-3.5 text-ink-muted">{c.season || "—"}</td>
                  <td className="px-5 py-3.5"><Pill label={c.status} tone={c.status} /></td>
                  <td className="num px-5 py-3.5 text-right text-ink">{c.linkCount}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2 text-xs">
                      {!canEdit.has(c.id) ? null : c.status === "active" ? (
                        <button onClick={() => patch(c.id, "stopped")} disabled={patching === c.id + "stopped"} className="text-ink-faint hover:text-accent transition">
                          {patching === c.id + "stopped" ? "…" : "Stop"}
                        </button>
                      ) : (
                        <button onClick={() => patch(c.id, "active")} disabled={patching === c.id + "active"} className="text-leads hover:opacity-80 transition">
                          {patching === c.id + "active" ? "…" : "Activate"}
                        </button>
                      )}
                      <Link href={`/campaigns/${c.id}`} className="text-ink-faint hover:text-ink transition">Analytics →</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{hint && <p className="hint">{hint}</p>}</div>;
}
