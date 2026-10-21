"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NameWithTerm } from "@/components/ui/NameWithTerm";
import { useT } from "@/lib/i18n/client";

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
  const t = useT();
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
    if (!res.ok) return setError(body.error ?? t("Could not add the type"));
    setTypeList([...typeList, { value: body.key, label: body.name }]);
    setV({ ...v, typeKey: body.key });
    setNewType(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name) return setError(t("Enter the project name and pick its term (F'26 / S'26)."));
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
    if (!res?.ok) return setError(body.error === "Validation failed" ? t("Check the fields: the name with its term and the type are required.") : body.error ?? t("Could not save"));
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
          {!v.id && <p className="hint">{t("A campaign with the same name is created too, ready for UTM links.")}</p>}
        </div>
        <div>
          <label className="label" htmlFor="p-type">{t("Project type")}</label>
          {newType === null ? (
            <div className="flex gap-2">
              <select id="p-type" className="input" required {...field("typeKey")}>
                <option value="" disabled>{t("Choose a type")}</option>
                {typeList.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
              <button type="button" className="btn-ghost shrink-0 py-2 text-xs" onClick={() => setNewType("")}>+ {t("type")}</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input className="input" autoFocus placeholder={t("e.g. Workshop")} value={newType} onChange={(e) => setNewType(e.target.value)} aria-label={t("New type name")} />
              <button type="button" className="btn-primary shrink-0 py-2 text-xs" onClick={addType}>{t("Add")}</button>
              <button type="button" className="btn-ghost shrink-0 py-2 text-xs" onClick={() => setNewType(null)}>✕</button>
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="p-status">{t("Status")}</label>
          <select id="p-status" className="input" {...field("status")}>
            <option value="planned">{t("Planned")}</option>
            <option value="registration">{t("Registration open")}</option>
            <option value="done">{t("Done")}</option>
            <option value="archived">{t("Archived")}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-start">{t("Start date")}</label>
          <input id="p-start" type="date" className="input" {...field("startDate")} />
        </div>
        <div>
          <label className="label" htmlFor="p-end">{t("End date")}</label>
          <input id="p-end" type="date" className="input" {...field("endDate")} />
        </div>
        <div>
          <label className="label" htmlFor="p-format">{t("Format")}</label>
          <select id="p-format" className="input" {...field("format")}>
            <option value="">{t("Not set")}</option>
            <option value="offline">{t("Offline")}</option>
            <option value="online">{t("Online")}</option>
            <option value="hybrid">{t("Hybrid")}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-city">{t("City")}</label>
          <input id="p-city" className="input" maxLength={80} placeholder={t("Astana")} {...field("city")} />
        </div>
        <div>
          <label className="label" htmlFor="p-venue">{t("Venue")}</label>
          <input id="p-venue" className="input" maxLength={120} {...field("venue")} />
        </div>
        <div>
          <label className="label" htmlFor="p-team">{t("Owner team")}</label>
          <input id="p-team" className="input" maxLength={80} placeholder="AIESEC NU" {...field("ownerTeam")} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="p-tags">{t("Tags")}</label>
          <input id="p-tags" className="input" placeholder="IT, Women in tech" {...field("tags")} />
          <p className="hint">{t("Comma-separated.")}</p>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? t("Saving…") : v.id ? t("Save") : t("Create project")}</button>
        {v.id && (!confirmDelete ? (
          <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>{t("Delete project")}</button>
        ) : (
          <>
            <span className="text-sm text-ink-muted">{t("Its reports stay but are detached from the project. Delete?")}</span>
            <button type="button" className="btn-danger" onClick={remove}>{t("Yes, delete")}</button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>{t("Cancel")}</button>
          </>
        ))}
      </div>
    </form>
  );
}
