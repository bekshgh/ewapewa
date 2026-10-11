"use client";

import { useState } from "react";
import type { ConversionState } from "@/lib/conversions/state";
import { call } from "./api";
import { HistoryPanel, type Snapshot } from "./HistoryPanel";
import { InputPanel } from "./InputPanel";
import { NumbersScheme } from "./NumbersScheme";
import { QualityPanel } from "./QualityPanel";
import { RatioCards } from "./RatioCards";
import { SettingsPanel } from "./SettingsPanel";

/** «Конверсия (EwA2ELD)» on the project page, type EwA2oGX. Admins only (project pages are). */
export function ConversionSection({
  projectId,
  projectSlug,
  initial,
  snapshots: initialSnapshots,
  campaigns,
  serviceAccountEmail,
}: {
  projectId: string;
  projectSlug: string;
  initial: ConversionState;
  snapshots: Snapshot[];
  campaigns: { id: string; name: string; label: string | null }[];
  serviceAccountEmail: string | null;
}) {
  const base = `/api/projects/${projectId}/conversion`;
  const [state, setState] = useState(initial);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelKey, setPanelKey] = useState(0);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const apply = (s: ConversionState) => {
    setState(s);
    setPanelKey((k) => k + 1); // re-seed the input form from saved values
  };

  const missingManual = (["showUp", "aiesecOrgSignup"] as const).filter((k) => state.inputs[k].value === null).map((k) => state.inputs[k].label);

  return (
    <section className="mt-6 space-y-4" aria-labelledby="conv-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="conv-title" className="font-display text-lg font-semibold">Конверсия (EwA2ELD)</h2>
        <span className="pill border border-accent/40 text-accent">EwA2oGX</span>
      </div>

      <RatioCards ratios={state.ratios} />

      {missingManual.length > 0 && (
        <p className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm text-ink-muted">
          Не хватает: {missingManual.join(", ")}
          <a href="#conv-input" className="btn-ghost border border-line text-xs">Внести</a>
        </p>
      )}

      <div className="card p-5">
        <h3 className="mb-3 font-display text-base font-semibold">Числа</h3>
        <NumbersScheme inputs={state.inputs} />
      </div>

      {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">✕ {error}</p>}

      <div className="grid gap-4 xl:grid-cols-3">
        <div id="conv-input" className="card scroll-mt-6 p-5 xl:col-span-2">
          <h3 className="mb-3 font-display text-base font-semibold">Ввод данных</h3>
          <InputPanel
            key={panelKey}
            state={state}
            busy={busy}
            onSaveManual={(v) => run("manual", async () => apply((await call<{ state: ConversionState }>(base, { method: "PATCH", body: JSON.stringify({ manual: v }) })).state))}
            onOverride={(key, v) =>
              run("override", async () =>
                apply((await call<{ state: ConversionState }>(base, { method: "PATCH", body: JSON.stringify({ override: { key, value: v?.value ?? null, reason: v?.reason } }) })).state),
              )
            }
            onRefresh={() => run("refresh", async () => apply((await call<{ state: ConversionState }>(`${base}/refresh`, { method: "POST" })).state))}
            onSnapshot={(v) => run("snapshot", async () => setSnapshots((await call<{ snapshots: Snapshot[] }>(`${base}/snapshots`, { method: "POST", body: JSON.stringify(v) })).snapshots))}
          />
        </div>
        <div className="card p-5">
          <h3 className="mb-3 font-display text-base font-semibold">Качество данных</h3>
          <QualityPanel state={state} reviewHref={`/projects/${projectSlug}/review`} />
        </div>
      </div>

      <details className="card p-5">
        <summary className="cursor-pointer font-display text-base font-semibold">Настройки источников</summary>
        <div className="mt-4">
          <SettingsPanel projectId={projectId} state={state} campaigns={campaigns} serviceAccountEmail={serviceAccountEmail} onChanged={apply} />
        </div>
      </details>

      <div className="card p-5">
        <h3 className="mb-3 font-display text-base font-semibold">История</h3>
        <HistoryPanel snapshots={snapshots} />
      </div>
    </section>
  );
}
