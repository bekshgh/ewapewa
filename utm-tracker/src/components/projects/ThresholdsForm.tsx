"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectSettings } from "@/lib/projects/settings";
import { useT } from "@/lib/i18n/client";

type Field = { key: keyof ProjectSettings; label: string; help: string; percent?: boolean; step?: number };

const FIELDS: Field[] = [
  { key: "minResponses", label: "Enough responses: n ≥", help: "The “Only with enough responses” filter and the “Best” view." },
  { key: "minResponseRate", label: "…and response rate ≥", help: "Together with the n threshold.", percent: true, step: 0.1 },
  { key: "smallSampleN", label: "Small sample when n <", help: "“Small sample” badge; such scores are not ranked with the rest." },
  { key: "burstyPeakShare", label: "Bursty campaign: one day >", help: "Share of registrations on the strongest day.", percent: true },
  { key: "attentionZone10", label: "“Needs attention”: weakest area <", help: "Score out of 10.", step: 0.1 },
  { key: "attentionResponseRate", label: "“Needs attention”: response rate <", help: "Share of registrants who answered.", percent: true, step: 0.1 },
  { key: "noFeedbackDays", label: "“No feedback”: held more than, days", help: "How long to wait for feedback after the event." },
  { key: "relativeMinProjects", label: "Relative filters: min projects of a type", help: "Below this the filter is disabled." },
];

/** Thresholds behind presets and badges, editable without a deploy. */
export function ThresholdsForm({ initial }: { initial: ProjectSettings }) {
  const t = useT();
  const router = useRouter();
  const [v, setV] = useState(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(f.percent ? +(initial[f.key] * 100).toFixed(2) : initial[f.key])])),
  );
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const body = Object.fromEntries(FIELDS.map((f) => [f.key, f.percent ? Number(v[f.key]) / 100 : Number(v[f.key])]));
    const res = await fetch("/api/settings/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setState(res?.ok ? "saved" : "error");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={`th-${f.key}`}>{t(f.label)}{f.percent ? ", %" : ""}</label>
            <input id={`th-${f.key}`} type="number" className="input" min={0} step={f.step ?? 1} required value={v[f.key]}
              onChange={(e) => (setState("idle"), setV({ ...v, [f.key]: e.target.value }))} />
            <p className="hint">{t(f.help)}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={state === "busy"}>{state === "busy" ? t("Saving…") : t("Save thresholds")}</button>
        {state === "saved" && <span className="text-sm text-leads">{t("Saved ✓")}</span>}
        {state === "error" && <span role="alert" className="text-sm text-danger">{t("Check the values")}</span>}
      </div>
    </form>
  );
}
