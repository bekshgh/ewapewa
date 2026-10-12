"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DEFAULT_TEMPLATE,
  PREFIX_RE,
  partnerRows,
  planKit,
  suggestPrefix,
  type ExistingLink,
  type KitRow,
  type KitTemplate,
  type PlannedRow,
} from "@/lib/linkKit";

type Props = {
  campaign: { id: string; name: string; label: string | null; slugPrefix: string | null };
  links: ExistingLink[];
  takenSlugs: string[];
  campaigns: { id: string; name: string; label: string | null }[];
  /** Project codes other campaigns already use → their name. */
  usedPrefixes: Record<string, string>;
  templates: KitTemplate[];
  commonDestination: string;
  base: string;
  sources: string[];
  mediums: string[];
};

type Created = (PlannedRow & { destinationUrl: string })[];

const links = (n: number) => `${n} link${n === 1 ? "" : "s"}`;

const STATUS: Record<PlannedRow["status"], { text: string; cls: string }> = {
  new: { text: "new", cls: "text-leads" },
  exists: { text: "already exists", cls: "text-ink-faint" },
  duplicate: { text: "repeated row", cls: "text-danger" },
};

export function LinkKitBuilder(p: Props) {
  const router = useRouter();
  const [prefix, setPrefix] = useState(() => {
    if (p.campaign.slugPrefix) return p.campaign.slugPrefix;
    const base = suggestPrefix(p.campaign.label || p.campaign.name);
    let code = base;
    for (let i = 2; p.usedPrefixes[code]; i++) code = `${base}${i}`.slice(0, 12);
    return code;
  });
  const [destination, setDestination] = useState(p.commonDestination);
  const [templates, setTemplates] = useState(p.templates);
  const [choice, setChoice] = useState(`t:${DEFAULT_TEMPLATE.name}`);
  const [rows, setRows] = useState<KitRow[]>(DEFAULT_TEMPLATE.rows);
  const [partners, setPartners] = useState(3);
  const [tplName, setTplName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const prefixOwner = p.usedPrefixes[prefix];
  const prefixOk = PREFIX_RE.test(prefix) && !prefixOwner;
  const plan = useMemo(
    () => planKit(prefixOk ? prefix : "xx", rows.filter((r) => r.source.trim()), p.links, p.takenSlugs),
    [prefix, prefixOk, rows, p.links, p.takenSlugs],
  );
  const toCreate = plan.filter((r) => r.status === "new").length;
  const short = (slug: string) => `${p.base}/r/${slug}`;

  async function choose(value: string) {
    setChoice(value);
    setError(null);
    setInfo(null);
    if (value.startsWith("t:")) {
      const t = templates.find((x) => x.name === value.slice(2));
      if (t) setRows(t.rows);
      return;
    }
    if (value.startsWith("c:")) {
      const res = await fetch(`/api/campaigns/${value.slice(2)}/utm-links/structure`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Could not load that campaign's links");
      if (!data.rows?.length) return setError("That campaign has no links with a utm_source");
      setRows(data.rows);
    }
  }

  const setRow = (i: number, patch: Partial<KitRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function saveTemplate() {
    setError(null);
    const res = await fetch("/api/link-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tplName.trim(), rows: rows.filter((r) => r.source.trim()) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Could not save the template");
    setTemplates(data.templates);
    setChoice(`t:${tplName.trim()}`);
    setInfo(`Template "${tplName.trim()}" saved`);
    setTplName("");
  }

  async function deleteTemplate(name: string) {
    const res = await fetch(`/api/link-templates?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTemplates(data.templates);
      setChoice(`t:${DEFAULT_TEMPLATE.name}`);
      setInfo(`Template "${name}" deleted`);
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/campaigns/${p.campaign.id}/utm-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugPrefix: prefix, destinationUrl: destination, rows: rows.filter((r) => r.source.trim()) }),
      });
      const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setCreated(data.rows);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const label = (r: KitRow) => r.label || [r.source, r.content || r.medium].filter(Boolean).join(" · ");

  function copyAll(list: Created) {
    const text = list.filter((r) => r.slug).map((r) => `${label(r)} — ${short(r.slug)}`).join("\n");
    void navigator.clipboard.writeText(text);
    setInfo("All links copied");
  }

  function downloadCsv(list: Created) {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [["name", "utm_source", "utm_medium", "utm_content", "short_url", "destination", "status"].join(",")];
    for (const r of list) {
      if (!r.slug) continue;
      lines.push([label(r), r.source, r.medium, r.content, short(r.slug), r.destinationUrl, r.status === "new" ? "created" : "existing"].map(esc).join(","));
    }
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}-utm-links.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (created) {
    const made = created.filter((r) => r.status === "new").length;
    return (
      <div className="card space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">
          Done: {links(made)} created
          {created.some((r) => r.status === "exists") && ", the rest already existed"}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary text-sm" onClick={() => copyAll(created)}>Copy all</button>
          <button className="btn-ghost border border-line text-sm" onClick={() => downloadCsv(created)}>Download CSV</button>
          <Link className="btn-ghost border border-line text-sm" href={`/campaigns/${p.campaign.id}`}>Back to campaign</Link>
          <button className="btn-ghost border border-line text-sm" onClick={() => setCreated(null)}>Create more</button>
        </div>
        {info && <p className="text-sm text-leads">{info}</p>}
        <ResultTable rows={created} short={short} label={label} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card grid gap-5 p-6 md:grid-cols-2">
        <div>
          <label className="label">Project code (starts every link)</label>
          <input className="input font-mono" value={prefix} onChange={(e) => setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} maxLength={12} />
          <p className={`hint mt-1 ${prefixOk ? "" : "text-danger"}`}>
            {prefixOk
              ? <>2–12 latin letters or digits, unique per campaign. Example: <code>{short(`${prefix}-ig-tapter`)}</code></>
              : prefixOwner
                ? `Already used by «${prefixOwner}». Each campaign needs its own code, e.g. ${prefix}2.`
                : "Use 2–12 latin letters or digits, e.g. tts"}
          </p>
        </div>
        <div>
          <label className="label">Landing page</label>
          <input className="input" placeholder="https://aiesecinkz.tilda.ws/…" value={destination} onChange={(e) => setDestination(e.target.value)} />
          <p className="hint mt-1">Where every link leads. A single link can have its own address in the table.</p>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px]">
            <label className="label">Start from</label>
            <select className="input" value={choice} onChange={(e) => void choose(e.target.value)}>
              <optgroup label="Templates">
                {templates.map((t) => (
                  <option key={t.name} value={`t:${t.name}`}>{t.name} ({t.rows.length})</option>
                ))}
              </optgroup>
              {p.campaigns.length > 0 && (
                <optgroup label="Same as another campaign">
                  {p.campaigns.map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>{c.label || c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          {choice.startsWith("t:") && choice.slice(2) !== DEFAULT_TEMPLATE.name && (
            <button className="btn-ghost border border-line text-sm" onClick={() => void deleteTemplate(choice.slice(2))}>Delete template</button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-2 font-medium">Name</th>
                <th className="py-2 pr-2 font-medium">utm_source</th>
                <th className="py-2 pr-2 font-medium">utm_medium</th>
                <th className="py-2 pr-2 font-medium">utm_content</th>
                <th className="py-2 pr-2 font-medium">Own address (optional)</th>
                <th className="py-2 pr-2 font-medium">Slug</th>
                <th className="py-2 pr-2 font-medium" />
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => {
                const planned = r.source.trim() ? plan[rows.slice(0, i).filter((x) => x.source.trim()).length] : null;
                return (
                  <tr key={i}>
                    <td className="py-1.5 pr-2"><input className="input py-1.5" placeholder="e.g. Banner" value={r.label ?? ""} onChange={(e) => setRow(i, { label: e.target.value })} /></td>
                    <td className="py-1.5 pr-2"><input className="input py-1.5" list="kit-sources" value={r.source} onChange={(e) => setRow(i, { source: e.target.value })} /></td>
                    <td className="py-1.5 pr-2"><input className="input py-1.5" list="kit-mediums" value={r.medium} onChange={(e) => setRow(i, { medium: e.target.value })} /></td>
                    <td className="py-1.5 pr-2"><input className="input py-1.5" value={r.content} onChange={(e) => setRow(i, { content: e.target.value })} /></td>
                    <td className="py-1.5 pr-2"><input className="input py-1.5" placeholder="landing page" value={r.destinationUrl ?? ""} onChange={(e) => setRow(i, { destinationUrl: e.target.value })} /></td>
                    <td className="py-1.5 pr-2 font-mono text-xs text-ink-muted">{planned?.slug || "—"}</td>
                    <td className={`py-1.5 pr-2 text-xs ${planned ? STATUS[planned.status].cls : "text-ink-faint"}`}>{planned ? STATUS[planned.status].text : ""}</td>
                    <td className="py-1.5 text-right">
                      <button className="text-ink-faint hover:text-danger" aria-label="Remove row" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="kit-sources">{p.sources.map((s) => <option key={s} value={s} />)}</datalist>
          <datalist id="kit-mediums">{p.mediums.map((s) => <option key={s} value={s} />)}</datalist>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button className="btn-ghost border border-line text-sm" onClick={() => setRows((rs) => [...rs, { label: "", source: "", medium: "", content: "" }])}>
            + Custom link
          </button>
          <span className="flex items-center gap-2">
            <button className="btn-ghost border border-line text-sm" onClick={() => setRows((rs) => [...rs, ...partnerRows(rs, partners)])}>
              + Info partners
            </button>
            <input className="input w-16 py-1.5" type="number" min={1} max={30} value={partners} onChange={(e) => setPartners(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
          </span>
          <span className="flex items-center gap-2">
            <input className="input w-56 py-1.5" placeholder="Template name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
            <button className="btn-ghost border border-line text-sm" disabled={!tplName.trim()} onClick={() => void saveTemplate()}>
              Save as template
            </button>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button className="btn-primary" disabled={busy || !prefixOk || !destination.trim() || toCreate === 0} onClick={() => void create()}>
          {busy ? "Creating…" : `Create ${links(toCreate)}`}
        </button>
        {plan.some((r) => r.status === "exists") && (
          <span className="text-sm text-ink-muted">{links(plan.filter((r) => r.status === "exists").length)} already in the campaign will be skipped</span>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
        {info && <span className="text-sm text-leads">{info}</span>}
      </div>
    </div>
  );
}

function ResultTable({ rows, short, label }: { rows: Created; short: (s: string) => string; label: (r: KitRow) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
            <th className="py-2 pr-3 font-medium">Link</th>
            <th className="py-2 pr-3 font-medium">Short URL</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.filter((r) => r.slug).map((r) => (
            <tr key={r.slug}>
              <td className="py-2 pr-3 text-ink">{label(r)}</td>
              <td className="py-2 pr-3 font-mono text-xs text-accent">{short(r.slug)}</td>
              <td className={`py-2 text-xs ${STATUS[r.status].cls}`}>{r.status === "new" ? "created" : "already existed"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
