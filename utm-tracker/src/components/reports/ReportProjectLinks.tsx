"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { THEMES } from "@/lib/projects/dictionaries";
import { useT } from "@/lib/i18n/client";

/** Which project a report belongs to. Changing it recomputes both projects' metrics. */
export function ReportProjectSelect({
  reportId,
  projectId,
  projects,
}: {
  reportId: string;
  projectId: string | null;
  projects: { id: string; name: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(value: string) {
    setBusy(true);
    await fetch(`/api/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: value || null }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="max-w-md">
      <label className="label" htmlFor="rep-project">{t("Project")}</label>
      <select id="rep-project" className="input" value={projectId ?? ""} disabled={busy} onChange={(e) => change(e.target.value)}>
        <option value="">{t("No project")}</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <p className="hint">{t("The project's filter metrics come from its reports and are recomputed right away.")}</p>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { praise: "Praised", pain: "Criticised", request: "Requested" };

/** Auto-suggested theme mapping; the admin confirms or corrects it. */
export function ThemeMappingEditor({
  reportId,
  mappings,
}: {
  reportId: string;
  mappings: { id: string; kind: string; rawLabel: string; canonical: string | null; confirmed: boolean }[];
}) {
  const t = useT();
  const router = useRouter();
  const [values, setValues] = useState(() => Object.fromEntries(mappings.map((m) => [m.id, m.canonical ?? ""])));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const unconfirmed = mappings.filter((m) => !m.confirmed).length;

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/reports/${reportId}/themes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings: mappings.map((m) => ({ id: m.id, canonical: values[m.id] || null })) }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ink-muted">
        {t("To compare projects, open-answer themes are mapped to a shared dictionary. The mapping was suggested automatically")}
        {unconfirmed ? <> — <strong className="text-accent">{t("{n} not confirmed yet", { n: unconfirmed })}</strong></> : " " + t("and confirmed")}. {t("Unmapped themes are ignored by the filters.")}
      </p>
      {(["praise", "pain", "request"] as const).map((kind) => {
        const list = mappings.filter((m) => m.kind === kind);
        if (!list.length) return null;
        return (
          <fieldset key={kind} className="mb-4">
            <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{t(KIND_LABEL[kind])}</legend>
            <ul className="divide-y divide-line">
              {list.map((m) => (
                <li key={m.id} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_260px]">
                  <label htmlFor={`tm-${m.id}`} className="text-sm text-ink">
                    {m.rawLabel}
                    {!m.confirmed && <span className="ml-2 text-[11px] text-accent">{t("suggested")}</span>}
                  </label>
                  <select id={`tm-${m.id}`} className="input py-1.5 text-sm" value={values[m.id]} onChange={(e) => (setSaved(false), setValues({ ...values, [m.id]: e.target.value }))}>
                    <option value="">— {t("not mapped")} —</option>
                    {THEMES.map((x) => <option key={x.key} value={x.key}>{t(x.label)}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
      <button type="button" className="btn-primary" disabled={busy} onClick={save}>
        {busy ? t("Saving…") : saved ? t("Saved ✓") : t("Confirm mapping")}
      </button>
    </div>
  );
}
