"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { conversions, type FolderNumbers, type NumberValue } from "@/lib/projectNumbers";
import { formatNumber, formatPercent } from "@/lib/utils";
import { NewBadge } from "@/components/ui/NewBadge";
import { useT } from "@/lib/i18n/client";

type Field = { key: string; label: string; n: NumberValue; hint: string };

export function ProjectNumbers({ folder, numbers, editable }: { folder: string; numbers: FolderNumbers; editable: boolean }) {
  const t = useT();
  const router = useRouter();
  const fields: Field[] = [
    { key: "projectRegs", label: t("Project registrations"), n: numbers.projectRegs, hint: t("leads of the project campaign") },
    { key: "showUp", label: t("Project show-up"), n: numbers.showUp, hint: t("people who came") },
    { key: "signups", label: t("AIESEC.org sign-ups"), n: numbers.signups, hint: t("sign-ups on aiesec.org") },
    ...numbers.programmes.map((p) => ({ key: `p:${p.id}`, label: t("{name} registrations", { name: p.title }), n: p.regs, hint: t("leads of the campaign") })),
  ];
  const initial = () => Object.fromEntries(fields.map((f) => [f.key, f.n.manual && f.n.value !== null ? String(f.n.value) : ""]));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // "oGX regs ÷ project regs" → the interface language
  const convLabel = (l: string) => {
    const m = l.match(/^(.+) regs ÷ project (regs|show-up)$/);
    if (!m || l.startsWith("AIESEC.org")) return t(l);
    return m[2] === "regs" ? t("{name} regs ÷ project regs", { name: m[1] }) : t("{name} regs ÷ project show-up", { name: m[1] });
  };

  async function save() {
    const num = (k: string) => {
      const v = draft[k]?.trim();
      return v ? Number(v) : undefined;
    };
    const bad = fields.find((f) => {
      const v = num(f.key);
      return v !== undefined && !(Number.isInteger(v) && v >= 0);
    });
    if (bad) { setError(t("{name}: enter a whole number, or leave empty", { name: bad.label })); return; }
    setSaving(true); setError("");
    const body = {
      projectRegs: num("projectRegs"),
      showUp: num("showUp"),
      signups: num("signups"),
      programmes: Object.fromEntries(
        numbers.programmes.flatMap((p) => {
          const v = num(`p:${p.id}`);
          return v === undefined ? [] : [[p.id, v]];
        }),
      ),
    };
    const res = await fetch(`/api/project-folders/${encodeURIComponent(folder)}/numbers`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? t("Could not save")); return; }
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="card mb-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">{t("Project numbers")} <NewBadge className="ml-1" /></h2>
          <p className="mt-1 text-xs text-ink-faint">
            {t("Registrations come from the tracker; type your own number to replace one, leave it empty to go back to the tracker's.")}
          </p>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <button className="btn-ghost text-sm" onClick={() => { setDraft(initial()); setEditing(false); setError(""); }} disabled={saving}>{t("Cancel")}</button>
            <button className="btn-primary text-sm" onClick={save} disabled={saving}>{saving ? t("Saving…") : t("Save")}</button>
          </div>
        ) : editable ? (
          <button className="btn-ghost text-sm" onClick={() => setEditing(true)}>{t("Edit numbers")}</button>
        ) : null}
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {fields.map((f) => (
          <div key={f.key} className="rounded-xl border border-line p-4">
            <div className="text-xs text-ink-muted">{f.label}</div>
            {editing ? (
              <input
                className="input mt-2 w-full"
                inputMode="numeric"
                value={draft[f.key] ?? ""}
                placeholder={f.n.tracked !== null ? String(f.n.tracked) : "—"}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            ) : (
              <div className="num mt-2 text-3xl font-bold tracking-tight text-ink">{f.n.value === null ? "—" : formatNumber(f.n.value)}</div>
            )}
            <div className="mt-1 text-xs text-ink-faint">
              {f.n.manual
                ? t("entered by hand") + (f.n.tracked !== null ? ` · ${t("tracker: {n}", { n: formatNumber(f.n.tracked) })}` : "")
                : f.n.tracked !== null ? t("from the tracker · {hint}", { hint: f.hint }) : t("not entered yet")}
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-ink">{t("Conversion")}</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {conversions(numbers).map((c) => (
          <div key={c.label} className="rounded-xl border border-line p-4">
            <div className="text-xs text-ink-muted">{convLabel(c.label)}</div>
            <div className="num mt-2 text-2xl font-bold text-ink">{c.pct === null ? "—" : formatPercent(c.pct)}</div>
            <div className="num mt-1 text-xs text-ink-faint">
              {c.num === null || c.den === null ? t("needs both numbers") : `${formatNumber(c.num)} / ${formatNumber(c.den)}`}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
