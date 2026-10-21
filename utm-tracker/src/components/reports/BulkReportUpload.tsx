"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eventKey, type UploadSummary } from "@/lib/projects/grouping";
import { MAX_COMPARE } from "@/lib/projects/filters/state";
import { cn } from "@/lib/utils";
import { withTerm } from "@/lib/naming";
import { useT } from "@/lib/i18n/client";

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
  /** the type could not be recognised: the person picks it */
  needsType?: boolean;
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
  const t = useT();
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
        if (s.type === "feedback" && g.target === "new") return { ...gs, [key]: { ...g, name: withTerm(s.eventName, s.eventDate ?? g.date), date: s.eventDate ?? g.date } };
        return gs;
      }
      const match = projects.find((p) => eventKey(p.name) === s.eventKey && s.eventKey);
      return {
        ...gs,
        [key]: { key, target: match?.id ?? "new", name: withTerm(s.eventName, s.eventDate), typeKey: types[0]?.value ?? "", date: s.eventDate ?? "" },
      };
    });
  }

  async function inspect(item: Item, type?: "feedback" | "registration") {
    const fd = new FormData();
    fd.set("file", item.file);
    if (type) fd.set("type", type);
    const res = await fetch("/api/reports/inspect", { method: "POST", body: fd }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok && body.code === "unknown_type" && !type) {
      // The file name usually says it: "… Registration Form Analysis.xlsx"
      const guess = /regist|регистр/i.test(item.file.name) ? "registration" : /feedback|фидбек|отзыв/i.test(item.file.name) ? "feedback" : null;
      if (guess) return inspect(item, guess);
      return patchItem(item.id, { status: "error", needsType: true, error: t("Could not tell whether this is a Feedback or a Registration analysis. Pick the type:") });
    }
    if (!res?.ok) return patchItem(item.id, { status: "error", needsType: false, error: body.error ?? t("Could not read the file.") });
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
        ? /\.xlsm$/i.test(f.name) ? t("Macro-enabled files (.xlsm) are not accepted — save it as .xlsx.") : t("Not an .xlsx file.")
        : f.size > MAX_MB * 1024 * 1024 ? t("Larger than {n} MB.", { n: MAX_MB }) : null;
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
        setGroups((gs) => ({ ...gs, [key]: { key, target: "new", name: withTerm(item.summary!.eventName, item.summary!.eventDate), typeKey: types[0]?.value ?? "", date: item.summary!.eventDate ?? "" } }));
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
          // a past event: no campaign for UTM links
          body: JSON.stringify({ name: g.name, typeKey: g.typeKey, status: "done", startDate: g.date || null, endDate: g.date || null, campaign: false }),
        }).catch(() => null);
        const body = res ? await res.json().catch(() => ({})) : {};
        if (!res?.ok) {
          files.forEach((f) => patchItem(f.id, { status: "failed", error: t("Could not create the project: {error}", { error: body.error ?? t("unknown error") }) }));
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
          patchItem(f.id, { status: "failed", error: body.error ?? t("Upload failed.") });
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
      aria-label={t("Choose .xlsx files")}
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
      <p className="text-sm font-medium text-ink">{phase === "pick" ? t("Drop one or more .xlsx files here, or click to choose") : "+ " + t("Add more files")}</p>
      {phase === "pick" && <p className="mt-1 text-xs text-ink-faint">{t("Feedback and Registration Form Analysis · up to {n} MB each · files of the same event are grouped into one project", { n: MAX_MB })}</p>}
    </div>
  );

  if (phase === "pick") {
    return (
      <>
        {dropZone}
        <p className="mt-2 text-xs text-ink-faint">
          {t("Making a new file? Build it with the report kit so it reads without warnings:")} <Link href="/reports/guide" className="text-accent hover:underline">{t("How to prepare a file")}</Link>.
        </p>
      </>
    );
  }

  /* ─── result ────────────────────────────────────────────────── */
  if (phase === "done" && done) {
    const failed = items.filter((x) => x.status === "failed" || x.status === "error");
    const cmp = done.projects.slice(0, MAX_COMPARE).map((p) => p.slug).join(",");
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink">
          {publish ? t("Saved {r} reports into {p} projects and published them.", { r: done.reports.length, p: done.projects.length }) : t("Saved {r} reports into {p} projects as drafts.", { r: done.reports.length, p: done.projects.length })}
        </p>
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {done.projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <Link href={`/projects/${p.slug}`} className="font-medium text-ink hover:text-accent">{p.name}</Link>
              <span className="text-xs text-ink-faint">{t("files: {n}", { n: p.files })}</span>
            </li>
          ))}
        </ul>
        {failed.length > 0 && (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            {t("Files not saved: {n}", { n: failed.length })}
            <ul className="mt-1 list-disc pl-5">
              {failed.map((f) => <li key={f.id}>{f.file.name}: {f.error}</li>)}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {done.projects.length >= 2 && (
            <Link href={`/projects?cmp=${cmp}`} className="btn-primary">
              {t("Compare these projects ({n})", { n: Math.min(done.projects.length, MAX_COMPARE) })} →
            </Link>
          )}
          {done.projects.length === 1 && <Link href={`/projects/${done.projects[0].slug}`} className="btn-primary">{t("Open the project")} →</Link>}
          {done.reports.length === 1 && <Link href={`/reports/${done.reports[0].id}`} className="btn-ghost">{t("Open the report")}</Link>}
          <button type="button" className="btn-ghost" onClick={reset}>{t("Upload more")}</button>
        </div>
        {done.projects.length > MAX_COMPARE && (
          <p className="text-xs text-ink-faint">{t("Up to {n} projects can be compared at once; pick the others in Projects.", { n: MAX_COMPARE })}</p>
        )}
      </div>
    );
  }

  /* ─── review ────────────────────────────────────────────────── */
  const errors = items.filter((x) => x.status === "error");
  return (
    <div className="space-y-5">
      {dropZone}

      {inspecting && <p className="text-sm text-ink-muted" aria-live="polite">{t("Reading files: {n}…", { n: items.filter((x) => x.status === "inspecting").length })}</p>}

      {errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {t("These files can't be used and will be skipped:")}
          <ul className="mt-1 list-disc pl-5">
            {errors.map((f) => (
              <li key={f.id}>
                {f.file.name}: {f.error}
                {f.needsType && (
                  <span className="ml-2 inline-flex gap-2">
                    {(["registration", "feedback"] as const).map((k) => (
                      <button key={k} type="button" className="btn-ghost px-2 py-0.5 text-xs text-ink"
                        onClick={() => { patchItem(f.id, { status: "inspecting", error: undefined, needsType: false }); inspect(f, k); }}>
                        {t(TYPE_LABEL[k])}
                      </button>
                    ))}
                  </span>
                )}
              </li>
            ))}
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
            <legend className="px-1 font-display text-sm font-semibold text-ink">{g.target === "new" ? g.name || t("New project") : projects.find((p) => p.id === g.target)?.name}</legend>
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_0.9fr]">
              <div>
                <label className="label text-xs" htmlFor={`g-${key}-t`}>{t("Project")}</label>
                <select id={`g-${key}-t`} className="input py-2 text-sm" value={g.target} onChange={(e) => setGroup(key, { target: e.target.value })}>
                  <option value="new">{t("Create a new project")}</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{t("Add to: {name}", { name: p.name })}</option>)}
                </select>
              </div>
              {g.target === "new" && (
                <>
                  <div>
                    <label className="label text-xs" htmlFor={`g-${key}-n`}>{t("Name")}</label>
                    <input id={`g-${key}-n`} className="input py-2 text-sm" value={g.name} maxLength={120} placeholder="SheCodes F'26" title={t("Project name, then the term: F'26 (fall) or S'26 (spring)")} onChange={(e) => setGroup(key, { name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label text-xs" htmlFor={`g-${key}-y`}>{t("Type")}</label>
                    <select id={`g-${key}-y`} className="input py-2 text-sm" value={g.typeKey} onChange={(e) => setGroup(key, { typeKey: e.target.value })}>
                      {types.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs" htmlFor={`g-${key}-d`}>{t("Event date")}</label>
                    <input id={`g-${key}-d`} type="date" className="input py-2 text-sm" value={g.date} onChange={(e) => setGroup(key, { date: e.target.value })} />
                  </div>
                </>
              )}
            </div>
            <ul className="mt-3 divide-y divide-line text-sm">
              {files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className={cn("pill text-[11px]", f.summary!.type === "feedback" ? "bg-leads/15 text-leads" : "bg-clicks/15 text-clicks")}>{t(TYPE_LABEL[f.summary!.type])}</span>
                  <span className="min-w-0 flex-1 truncate text-ink" title={f.file.name}>{f.file.name}</span>
                  <span className="text-xs text-ink-faint">
                    {f.summary!.period ?? ""}
                    {f.summary!.sampleSize !== undefined ? ` · n = ${f.summary!.sampleSize}` : ""}
                    {f.summary!.warnings ? ` · ${t("warnings: {n}", { n: f.summary!.warnings })}` : ""}
                  </span>
                  <StatusBadge item={f} />
                  {phase === "review" && (
                    <select className="input w-auto py-1 text-xs" aria-label={t("Event of {name}", { name: f.file.name })} value={f.group} onChange={(e) => moveItem(f, e.target.value)}>
                      {groupKeys.map((k) => <option key={k} value={k}>{groups[k]?.target === "new" ? groups[k]?.name : projects.find((p) => p.id === groups[k]?.target)?.name}</option>)}
                      <option value="__own">{t("Separate project")}</option>
                    </select>
                  )}
                </li>
              ))}
            </ul>
            {dup && <p className="mt-2 text-xs text-accent">⚠ {t("Two files of the same type in one project — the most recently uploaded one is used for the project's metrics.")}</p>}
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="btn-primary" disabled={inspecting || phase === "saving" || ready.length === 0} onClick={save}>
          {phase === "saving"
            ? t("Saving…")
            : t("Save {r} reports into {p} projects", { r: ready.length, p: groupKeys.length })}
        </button>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={publish} onChange={(e) => setPublish(e.target.checked)} disabled={phase === "saving"} />
          {t("Publish right away")}
        </label>
        {phase === "review" && <button type="button" className="text-sm text-ink-faint hover:text-ink" onClick={reset}>{t("Cancel")}</button>}
      </div>
      <p className="text-xs text-ink-faint">{t("Files are read on the server and not stored: only the analytics sheets are saved.")}</p>
    </div>
  );
}

function StatusBadge({ item }: { item: Item }) {
  const t = useT();
  const map: Partial<Record<ItemStatus, [string, string]>> = {
    saving: [t("Saving…"), "text-ink-muted"],
    saved: [t("Saved ✓"), "text-leads"],
    failed: [t("Failed: {error}", { error: item.error ?? "" }), "text-danger"],
  };
  const m = map[item.status];
  return m ? <span className={cn("text-xs", m[1])}>{m[0]}</span> : null;
}
