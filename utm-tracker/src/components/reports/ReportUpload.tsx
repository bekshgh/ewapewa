"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

const MAX_MB = 4;

/**
 * Drop-zone upload. "create" makes a new draft and opens it; "replace" swaps
 * the data of an existing report (same link) and refreshes the page.
 */
export function ReportUpload({
  mode,
  reportId,
  projects = [],
}: {
  mode: "create" | "replace";
  reportId?: string;
  projects?: { id: string; name: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("auto");
  const [eventName, setEventName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return setError(/\.xlsm$/i.test(f.name) ? t("Macro-enabled files (.xlsm) are not accepted — save it as .xlsx.") : t("Please choose an .xlsx file."));
    if (f.size > MAX_MB * 1024 * 1024) return setError(t("The file is larger than {n} MB.", { n: MAX_MB }));
    setFile(f);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError(t("Choose a file."));
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("type", type);
    if (eventName.trim()) fd.set("eventName", eventName.trim());
    if (projectId) fd.set("projectId", projectId);
    const res = await fetch(mode === "create" ? "/api/reports" : `/api/reports/${reportId}/file`, { method: "POST", body: fd }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) return setError(body.error ?? t("Upload failed. Please try again."));
    if (mode === "create") router.push(`/reports/${body.id}`);
    else {
      setFile(null);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label={t("Choose an .xlsx file")}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
          drag ? "border-accent bg-accent/5" : "border-line hover:border-ink-faint",
        )}
      >
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <p className="text-sm font-medium text-ink">{file ? file.name : t("Drop an .xlsx here or click to choose")}</p>
        <p className="mt-1 text-xs text-ink-faint">
          {file ? t("{n} KB", { n: (file.size / 1024).toFixed(0) }) : t("Feedback or Registration Form Analysis · up to {n} MB", { n: MAX_MB })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rep-type">{t("Report type")}</label>
          <select id="rep-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="auto">{t("Detect automatically")}</option>
            <option value="feedback">Feedback Form Analysis</option>
            <option value="registration">Registration Form Analysis</option>
          </select>
        </div>
        {mode === "create" && projects.length > 0 && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="rep-proj">{t("Project")}</label>
            <select id="rep-proj" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{t("No project (can be set later)")}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {mode === "create" && (
          <div>
            <label className="label" htmlFor="rep-event">{t("Event name")}</label>
            <input id="rep-event" className="input" placeholder={t("Taken from the file")} value={eventName} maxLength={120} onChange={(e) => setEventName(e.target.value)} />
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy || !file}>
          {busy ? t("Reading the file…") : mode === "create" ? t("Upload and preview") : t("Replace data")}
        </button>
        <p className="text-xs text-ink-faint">{t("The file is read on the server and not stored: only the analytics sheets are saved.")}</p>
      </div>
    </form>
  );
}
