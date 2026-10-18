"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NameWithTerm } from "@/components/ui/NameWithTerm";

export interface ProjectFormValue {
  id?: string;
  name: string;
  typeKey: string;
  format: string;
  status: string;
  startDate: string;
  endDate: string;
  city: string;
  venue: string;
  ownerTeam: string;
  tags: string;
}

export const EMPTY_PROJECT: ProjectFormValue = {
  name: "", typeKey: "", format: "", status: "planned", startDate: "", endDate: "", city: "", venue: "", ownerTeam: "", tags: "",
};

/** Create / edit a project. Types come from the dictionary; a new type can be added inline. */
export function ProjectForm({ initial, types }: { initial: ProjectFormValue; types: { value: string; label: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [typeList, setTypeList] = useState(types);
  const [newType, setNewType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const field = (k: keyof ProjectFormValue) => ({
    value: v[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value }),
  });

  async function addType() {
    if (!newType?.trim()) return;
    const res = await fetch("/api/project-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newType.trim() }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Could not add the type");
    setTypeList([...typeList, { value: body.key, label: body.name }]);
    setV({ ...v, typeKey: body.key });
    setNewType(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name) return setError("Enter the project name and pick its term (F'26 / S'26).");
    setBusy(true);
    setError(null);
    const payload = {
      name: v.name,
      typeKey: v.typeKey,
      format: v.format || null,
      status: v.status,
      startDate: v.startDate || null,
      endDate: v.endDate || null,
      city: v.city,
      venue: v.venue,
      ownerTeam: v.ownerTeam,
      tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    const res = await fetch(v.id ? `/api/projects/${v.id}` : "/api/projects", {
      method: v.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(body.error === "Validation failed" ? "Check the fields: the name with its term and the type are required." : body.error ?? "Could not save");
    router.push(`/projects/${body.slug}`);
    router.refresh();
  }

  async function remove() {
    if (!v.id) return;
    await fetch(`/api/projects/${v.id}`, { method: "DELETE" });
    router.push("/projects");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <NameWithTerm id="p-name" value={v.name} onChange={(name) => setV((cur) => ({ ...cur, name }))} placeholder="ÖZGE Forum" />
          {!v.id && <p className="hint">A campaign with the same name is created too, ready for UTM links.</p>}
        </div>
        <div>
          <label className="label" htmlFor="p-type">Project type</label>
          {newType === null ? (
            <div className="flex gap-2">
              <select id="p-type" className="input" required {...field("typeKey")}>
                <option value="" disabled>Choose a type</option>
                {typeList.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button type="button" className="btn-ghost shrink-0 py-2 text-xs" onClick={() => setNewType("")}>+ type</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input className="input" autoFocus placeholder="e.g. Workshop" value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="New type name" />
              <button type="button" className="btn-primary shrink-0 py-2 text-xs" onClick={addType}>Add</button>
              <button type="button" className="btn-ghost shrink-0 py-2 text-xs" onClick={() => setNewType(null)}>✕</button>
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="p-status">Status</label>
          <select id="p-status" className="input" {...field("status")}>
            <option value="planned">Planned</option>
            <option value="registration">Registration open</option>
            <option value="done">Done</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-start">Start date</label>
          <input id="p-start" type="date" className="input" {...field("startDate")} />
        </div>
        <div>
          <label className="label" htmlFor="p-end">End date</label>
          <input id="p-end" type="date" className="input" {...field("endDate")} />
        </div>
        <div>
          <label className="label" htmlFor="p-format">Format</label>
          <select id="p-format" className="input" {...field("format")}>
            <option value="">Not set</option>
            <option value="offline">Offline</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-city">City</label>
          <input id="p-city" className="input" maxLength={80} placeholder="Astana" {...field("city")} />
        </div>
        <div>
          <label className="label" htmlFor="p-venue">Venue</label>
          <input id="p-venue" className="input" maxLength={120} {...field("venue")} />
        </div>
        <div>
          <label className="label" htmlFor="p-team">Owner team</label>
          <input id="p-team" className="input" maxLength={80} placeholder="AIESEC NU" {...field("ownerTeam")} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="p-tags">Tags</label>
          <input id="p-tags" className="input" placeholder="IT, Women in tech" {...field("tags")} />
          <p className="hint">Comma-separated.</p>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : v.id ? "Save" : "Create project"}</button>
        {v.id && (!confirmDelete ? (
          <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Delete project</button>
        ) : (
          <>
            <span className="text-sm text-ink-muted">Its reports stay but are detached from the project. Delete?</span>
            <button type="button" className="btn-danger" onClick={remove}>Yes, delete</button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ))}
      </div>
    </form>
  );
}
