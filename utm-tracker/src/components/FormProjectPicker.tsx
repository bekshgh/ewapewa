"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NewBadge } from "@/components/ui/NewBadge";

/** Which project folder a form belongs to; worked out automatically, can be changed by hand. */
export function FormProjectPicker({ formId, current, byHand, projects, editable }: {
  formId: string;
  current: string | null;
  byHand: boolean;
  projects: { key: string; title: string }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const title = (k: string | null) => (k ? projects.find((p) => p.key === k)?.title ?? k : "No project");

  async function pick(value: string) {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/forms/${encodeURIComponent(formId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectSlug: value || null }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? "Could not save"); return; }
    router.refresh();
  }

  return (
    <div className="card mb-6 flex flex-wrap items-center gap-3 p-4 text-sm">
      <span className="text-ink-faint">Project <NewBadge className="ml-1" /></span>
      {editable ? (
        <select className="input w-auto min-w-[14rem]" value={current ?? ""} disabled={saving} onChange={(e) => pick(e.target.value)} aria-label="Project folder">
          <option value="">No project</option>
          {current && !projects.some((p) => p.key === current) && <option value={current}>{current}</option>}
          {projects.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}
        </select>
      ) : (
        <span className="text-ink">{title(current)}</span>
      )}
      <span className="text-xs text-ink-faint">
        {byHand ? "set by hand" : current ? "found automatically from the page's links / UTM" : "not found yet: add a tracker link to this page in the project's campaign, or pick it here"}
      </span>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
