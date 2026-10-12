"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eventKey, type UploadSummary } from "@/lib/projects/grouping";
import { MAX_COMPARE } from "@/lib/projects/filters/state";
import { cn } from "@/lib/utils";

const MAX_MB = 4;
const PARALLEL = 3;

export interface ProjectOption {
  id: string;
  slug: string;
  name: string;
}

type ItemStatus = "inspecting" | "ready" | "error" | "saving" | "saved" | "failed";

interface Item {
  id: number;
  file: File;
  status: ItemStatus;
  summary?: UploadSummary;
  error?: string;
  /** which group (event) the file belongs to */
  group: string;
  reportId?: string;
}

interface Group {
  key: string;
  /** "new" or an existing project id */
  target: string;
  name: string;
  typeKey: string;
  date: string;
}

const TYPE_LABEL = { feedback: "Feedback", registration: "Registration" } as const;

/**
 * Upload several analysis files at once. Each file is checked first (nothing
 * is saved), files of the same event are grouped into one project — an
 * existing one with the same name, or a new one — and then everything is
 * saved. The result links straight to comparing the projects.
 */
export function BulkReportUpload({ projects, types }: { projects: ProjectOption[]; types: { value: string; label: string }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<Record<string, Group>>({});
  const [drag, setDrag] = useState(false);
  const [publish, setPublish] = useState(false);
  const [phase, setPhase] = useState<"pick" | "review" | "saving" | "done">("pick");
  const [done, setDone] = useState<{ projects: (ProjectOption & { files: number })[]; reports: { id: string; fileName: string }[] } | null>(null);

  const patchItem = (id: number, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  /** Suggest a project for a newly seen event: same name → that project, else a new one. */
  function ensureGroup(key: string, s: UploadSummary) {
    setGroups((gs) => {
      const g = gs[key];
      if (g) {
        // Prefer the feedback report's name and the event day from feedback.
        if (s.type === "feedback" && g.target === "new") return { ...gs, [key]: { ...g, name: s.eventName, date: s.eventDate ?? g.date } };
        return gs;
      }
      const match = projects.find((p) => eventKey(p.name) === s.eventKey && s.eventKey);
      return {
        ...gs,
        [key]: { key, target: match?.id ?? "new", name: s.eventName, typeKey: types[0]?.value ?? "", date: s.eventDate ?? "" },
      };
    });
  }

  async function inspect(item: Item) {
    const fd = new FormData();
    fd.set("file", item.file);
    const res = await fetch("/api/reports/inspect", { method: "POST", body: fd }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return patchItem(item.id, { status: "error", error: body.error ?? "Could not read the file." });
    const s = body as UploadSummary;
    const group = s.eventKey || `file-${item.id}`;
    ensureGroup(group, s);
    patchItem(item.id, { status: "ready", summary: s, group });
  }

  async function add(files: FileList | File[]) {
    const fresh: Item[] = [];
    for (const f of Array.from(files)) {
      const id = nextId.current++;
      const bad = !/\.xlsx$/i.test(f.name)
        ? /\.xlsm$/i.test(f.name) ? "Macro-enabled files (.xlsm) are not accepted — save it as .xlsx." : "Not an .xlsx file."
        : f.size > MAX_MB * 1024 * 1024 ? `Larger than ${MAX_MB} MB.` : null;
      fresh.push({ id, file: f, status: bad ? "error" : "inspecting", error: bad ?? undefined, group: `file-${id}` });
    }
    setItems((xs) => [...xs, ...fresh]);
    setPhase("review");
    const queue = fresh.filter((x) => x.status === "inspecting");
    const workers = Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      for (let it = queue.shift(); it; it = queue.shift()) await inspect(it);
    });
    await Promise.all(workers);
  }

  const ready = items.filter((x) => x.status === "ready" || x.status === "saved" || x.status === "saving" || x.status === "failed");
  const groupKeys = useMemo(() => [...new Set(ready.map((x) => x.group))], [ready]);
  const inspecting = items.some((x) => x.status === "inspecting");
  const setGroup = (key: string, p: Partial<Group>) => setGroups((gs) => ({ ...gs, [key]: { ...gs[key], ...p } }));

  /** Move a file to another event group (or to a group of its own). */
  function moveItem(item: Item, to: string) {
    if (to === "__own") {
      const key = `file-${item.id}`;
      if (!groups[key] && item.summary) {
        setGroups((gs) => ({ ...gs, [key]: { key, target: "new", name: item.summary!.eventName, typeKey: types[0]?.value ?? "", date: item.summary!.eventDate ?? "" } }));
      }
      return patchItem(item.id, { group: key });
    }
    patchItem(item.id, { group: to });
  }

  async function save() {
    setPhase("saving");
    const savedProjects: (ProjectOption & { files: number })[] = [];
    const savedReports: { id: string; fileName: string }[] = [];
    for (const key of groupKeys) {
      const g = groups[key];
      const files = items.filter((x) => x.group === key && x.status === "ready");
      if (!files.length) continue;

      let project = projects.find((p) => p.id === g.target);
      if (!project) {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: g.name, typeKey: g.typeKey, status: "done", startDate: g.date || null, endDate: g.date || null }),
        }).catch(() => null);
        const body = res ? await res.json().catch(() => ({})) : {};
        if (!res?.ok) {
          files.forEach((f) => patchItem(f.id, { status: "failed", error: `Could not create the project: ${body.error ?? "unknown error"}` }));
          continue;
        }
        project = { id: body.id, slug: body.slug, name: g.name };
      }
      const entry = { ...project, files: 0 };
      savedProjects.push(entry);

      for (const f of files) {
        patchItem(f.id, { status: "saving" });
        const fd = new FormData();
        fd.set("file", f.file);
        fd.set("type", f.summary?.type ?? "auto");
        fd.set("projectId", project.id);
        const res = await fetch("/api/reports", { method: "POST", body: fd }).catch(() => null);
        const body = res ? await res.json().catch(() => ({})) : {};
        if (!res?.ok) {
          patchItem(f.id, { status: "failed", error: body.error ?? "Upload failed." });
          continue;
        }
        if (publish) {
          await fetch(`/api/reports/${body.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "published" }),
          }).catch(() => null);
        }
        patchItem(f.id, { status: "saved", reportId: body.id });
        entry.files++;
        savedReports.push({ id: body.id, fileName: f.file.name });
      }
    }
    setDone({ projects: savedProjects, reports: savedReports });
    setPhase("done");
    router.refresh();
  }

  function reset() {
    setItems([]);
    setGroups({});
    setDone(null);
    setPhase("pick");
  }

  /* ─── drop-zone ─────────────────────────────────────────────── */
  const dropZone = (
    <div
      role="button"
      tabIndex={0}
      aria-label="Choose .xlsx files"
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) add(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition",
        phase === "pick" ? "py-10" : "py-4",
        drag ? "border-accent bg-accent/5" : "border-line hover:border-ink-faint",
      )}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) add(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="text-sm font-medium text-ink">{phase === "pick" ? "Drop one or more .xlsx files here, or click to choose" : "+ Add more files"}</p>
      {phase === "pick" && <p className="mt-1 text-xs text-ink-faint">Feedback and Registration Form Analysis · up to {MAX_MB} MB each · files of the same event are grouped into one project</p>}
    </div>
  );

  if (phase === "pick") return dropZone;

  /* ─── result ────────────────────────────────────────────────── */
  if (phase === "done" && done) {
    const failed = items.filter((x) => x.status === "failed" || x.status === "error");
    const cmp = done.projects.slice(0, MAX_COMPARE).map((p) => p.slug).join(",");
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink">
          Saved <strong>{done.reports.length}</strong> {done.reports.length === 1 ? "report" : "reports"} into <strong>{done.projects.length}</strong>{" "}
          {done.projects.length === 1 ? "project" : "projects"}
          {publish ? " and published them" : " as drafts"}.
        </p>
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {done.projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <Link href={`/projects/${p.slug}`} className="font-medium text-ink hover:text-accent">{p.name}</Link>
              <span className="text-xs text-ink-faint">{p.files} {p.files === 1 ? "file" : "files"}</span>
            </li>
          ))}
        </ul>
        {failed.length > 0 && (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            {failed.length} file(s) were not saved:
            <ul className="mt-1 list-disc pl-5">
              {failed.map((f) => <li key={f.id}>{f.file.name}: {f.error}</li>)}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {done.projects.length >= 2 && (
            <Link href={`/projects?cmp=${cmp}`} className="btn-primary">
              Compare these {Math.min(done.projects.length, MAX_COMPARE)} projects →
            </Link>
          )}
          {done.projects.length === 1 && <Link href={`/projects/${done.projects[0].slug}`} className="btn-primary">Open the project →</Link>}
          {done.reports.length === 1 && <Link href={`/reports/${done.reports[0].id}`} className="btn-ghost">Open the report</Link>}
          <button type="button" className="btn-ghost" onClick={reset}>Upload more</button>
        </div>
        {done.projects.length > MAX_COMPARE && (
          <p className="text-xs text-ink-faint">Up to {MAX_COMPARE} projects can be compared at once; pick the others in Projects.</p>
        )}
      </div>
    );
  }

  /* ─── review ────────────────────────────────────────────────── */
  const errors = items.filter((x) => x.status === "error");
  return (
    <div className="space-y-5">
      {dropZone}

      {inspecting && <p className="text-sm text-ink-muted" aria-live="polite">Reading {items.filter((x) => x.status === "inspecting").length} file(s)…</p>}

      {errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          These files can't be used and will be skipped:
          <ul className="mt-1 list-disc pl-5">
            {errors.map((f) => <li key={f.id}>{f.file.name}: {f.error}</li>)}
          </ul>
        </div>
      )}

      {groupKeys.map((key) => {
        const g = groups[key];
        if (!g) return null;
        const files = items.filter((x) => x.group === key && x.summary);
        const fileTypes = files.map((f) => f.summary!.type);
        const dup = fileTypes.length !== new Set(fileTypes).size;
        return (
          <fieldset key={key} className="rounded-2xl border border-line p-4" disabled={phase === "saving"}>
            <legend className="px-1 font-display text-sm font-semibold text-ink">{g.target === "new" ? g.name || "New project" : projects.find((p) => p.id === g.target)?.name}</legend>
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_0.9fr]">
              <div>
                <label className="label text-xs" htmlFor={`g-${key}-t`}>Project</label>
                <select id={`g-${key}-t`} className="input py-2 text-sm" value={g.target} onChange={(e) => setGroup(key, { target: e.target.value })}>
                  <option value="new">Create a new project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>Add to: {p.name}</option>)}
                </select>
              </div>
              {g.target === "new" && (
                <>
                  <div>
                    <label className="label text-xs" htmlFor={`g-${key}-n`}>Name</label>
                    <input id={`g-${key}-n`} className="input py-2 text-sm" value={g.name} maxLength={120} onChange={(e) => setGroup(key, { name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label text-xs" htmlFor={`g-${key}-y`}>Type</label>
                    <select id={`g-${key}-y`} className="input py-2 text-sm" value={g.typeKey} onChange={(e) => setGroup(key, { typeKey: e.target.value })}>
                      {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs" htmlFor={`g-${key}-d`}>Event date</label>
                    <input id={`g-${key}-d`} type="date" className="input py-2 text-sm" value={g.date} onChange={(e) => setGroup(key, { date: e.target.value })} />
                  </div>
                </>
              )}
            </div>
            <ul className="mt-3 divide-y divide-line text-sm">
              {files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className={cn("pill text-[11px]", f.summary!.type === "feedback" ? "bg-leads/15 text-leads" : "bg-clicks/15 text-clicks")}>{TYPE_LABEL[f.summary!.type]}</span>
                  <span className="min-w-0 flex-1 truncate text-ink" title={f.file.name}>{f.file.name}</span>
                  <span className="text-xs text-ink-faint">
                    {f.summary!.period ?? ""}
                    {f.summary!.sampleSize !== undefined ? ` · n = ${f.summary!.sampleSize}` : ""}
                    {f.summary!.warnings ? ` · ${f.summary!.warnings} warning(s)` : ""}
                  </span>
                  <StatusBadge item={f} />
                  {phase === "review" && (
                    <select className="input w-auto py-1 text-xs" aria-label={`Event of ${f.file.name}`} value={f.group} onChange={(e) => moveItem(f, e.target.value)}>
                      {groupKeys.map((k) => <option key={k} value={k}>{groups[k]?.target === "new" ? groups[k]?.name : projects.find((p) => p.id === groups[k]?.target)?.name}</option>)}
                      <option value="__own">Separate project</option>
                    </select>
                  )}
                </li>
              ))}
            </ul>
            {dup && <p className="mt-2 text-xs text-accent">⚠ Two files of the same type in one project — the most recently uploaded one is used for the project&apos;s metrics.</p>}
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="btn-primary" disabled={inspecting || phase === "saving" || ready.length === 0} onClick={save}>
          {phase === "saving"
            ? "Saving…"
            : `Save ${ready.length} ${ready.length === 1 ? "report" : "reports"} into ${groupKeys.length} ${groupKeys.length === 1 ? "project" : "projects"}`}
        </button>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={publish} onChange={(e) => setPublish(e.target.checked)} disabled={phase === "saving"} />
          Publish right away
        </label>
        {phase === "review" && <button type="button" className="text-sm text-ink-faint hover:text-ink" onClick={reset}>Cancel</button>}
      </div>
      <p className="text-xs text-ink-faint">Files are read on the server and not stored: only the analytics sheets are saved.</p>
    </div>
  );
}

function StatusBadge({ item }: { item: Item }) {
  const map: Partial<Record<ItemStatus, [string, string]>> = {
    saving: ["Saving…", "text-ink-muted"],
    saved: ["Saved ✓", "text-leads"],
    failed: [`Failed: ${item.error ?? ""}`, "text-danger"],
  };
  const m = map[item.status];
  return m ? <span className={cn("text-xs", m[1])}>{m[0]}</span> : null;
}
