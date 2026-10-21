"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pill } from "@/components/ui/Pill";
import { NameWithTerm } from "@/components/ui/NameWithTerm";
import { utmCampaignOf } from "@/lib/naming";

type Row = {
  id: string; name: string; label: string | null; description: string | null;
  funnel: string | null; season: string | null; type: string | null;
  status: string; linkCount: number;
};

export function CampaignManager({ campaigns, canCreate, editable }: { campaigns: Row[]; canCreate: boolean; editable: string[] }) {
  const canEdit = new Set(editable);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const EMPTY = { name: "", label: "", description: "", funnel: "", type: "" };
  const [form, setForm] = useState(EMPTY);
  const [nameKey, setNameKey] = useState(0); // remounts the name field after a save
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [patching, setPatching] = useState<string | null>(null);

  async function add() {
    if (!form.label) { setError("Enter the campaign name and pick its term (F'26 / S'26)"); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, name: form.name || utmCampaignOf(form.label), status: "active" }),
    });
    setSaving(false);
    if (res.ok) { setForm(EMPTY); setNameKey((k) => k + 1); setOpen(false); router.refresh(); }
    else {
      const err = (await res.json().catch(() => null))?.error;
      setError((res.status === 403 || res.status === 422) && err && err !== "Validation failed" ? err : "Could not save. Check the campaign name is unique and valid.");
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
            <div className="sm:col-span-2">
              <NameWithTerm key={nameKey} id="c-name" label="Campaign name" placeholder="ICY  ·  or  TopTalents Sprint EwA2oGX" value={form.label} onChange={(label) => set("label", label)} />
            </div>
            <Field label="utm_campaign value" hint="Made from the name; change only if you need another value">
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={form.label ? utmCampaignOf(form.label) : "icy_s26"} />
            </Field>
            <Field label="Funnel / project"><input className="input" value={form.funnel} onChange={(e) => set("funnel", e.target.value)} placeholder="Projects" /></Field>
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
                        <button onClick={() => patch(c.id, "paused")} disabled={patching === c.id + "paused"} title="Links keep opening the page, clicks stop being counted" className="text-ink-faint hover:text-accent transition">
                          {patching === c.id + "paused" ? "…" : "Pause"}
                        </button>
                      ) : (
                        <button onClick={() => patch(c.id, "active")} disabled={patching === c.id + "active"} className="text-leads hover:opacity-80 transition">
                          {patching === c.id + "active" ? "…" : "Resume"}
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
