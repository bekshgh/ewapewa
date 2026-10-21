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
import { shortUrl, storedDomain } from "@/lib/linkDomains";
import { plural } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/client";

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
  /** Short-link domains, the main one first (Settings → Short link domains). */
  domains: string[];
  sources: string[];
  mediums: string[];
};

type Created = (PlannedRow & { destinationUrl: string })[];

const STATUS: Record<PlannedRow["status"], { text: string; cls: string }> = {
  new: { text: "new", cls: "text-leads" },
  exists: { text: "already exists", cls: "text-ink-faint" },
  duplicate: { text: "repeated row", cls: "text-danger" },
};

export function LinkKitBuilder(p: Props) {
  const t = useT();
  const lang = useLang();
  const links = (n: number) => `${n} ${plural(lang, n, "ссылка", "ссылки", "ссылок", "link", "links")}`;
  const router = useRouter();
  const [prefix, setPrefix] = useState(() => {
    if (p.campaign.slugPrefix) return p.campaign.slugPrefix;
    const base = suggestPrefix(p.campaign.label || p.campaign.name);
    let code = base;
    for (let i = 2; p.usedPrefixes[code]; i++) code = `${base}${i}`.slice(0, 12);
    return code;
  });
  const [destination, setDestination] = useState(p.commonDestination);
  const [domain, setDomain] = useState(p.domains[0] ?? "");
  const extraDomain = storedDomain(p.base, domain);
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
    () => planKit(prefixOk ? prefix : "xx", rows.filter((r) => r.source.trim()), p.links, p.takenSlugs, extraDomain),
    [prefix, prefixOk, rows, p.links, p.takenSlugs, extraDomain],
  );
  const toCreate = plan.filter((r) => r.status === "new").length;
  const short = (slug: string) => shortUrl(p.base, slug, extraDomain);

  async function choose(value: string) {
    setChoice(value);
    setError(null);
    setInfo(null);
    if (value.startsWith("t:")) {
      const tpl = templates.find((x) => x.name === value.slice(2));
      if (tpl) setRows(tpl.rows);
      return;
    }
    if (value.startsWith("c:")) {
      const res = await fetch(`/api/campaigns/${value.slice(2)}/utm-links/structure`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? t("Could not load that campaign's links"));
      if (!data.rows?.length) return setError(t("That campaign has no links with a utm_source"));
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
    if (!res.ok) return setError(data.error ?? t("Could not save the template"));
    setTemplates(data.templates);
    setChoice(`t:${tplName.trim()}`);
    setInfo(t("Template \"{name}\" saved", { name: tplName.trim() }));
    setTplName("");
  }

  async function deleteTemplate(name: string) {
    const res = await fetch(`/api/link-templates?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTemplates(data.templates);
      setChoice(`t:${DEFAULT_TEMPLATE.name}`);
      setInfo(t("Template \"{name}\" deleted", { name }));
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
        body: JSON.stringify({ slugPrefix: prefix, destinationUrl: destination, shortDomain: extraDomain, rows: rows.filter((r) => r.source.trim()) }),
      });
      const data = await res.json().catch(() => ({ error: t("Request failed ({status})", { status: res.status }) }));
      if (!res.ok) throw new Error(data.error ?? t("Request failed ({status})", { status: res.status }));
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
    setInfo(t("All links copied"));
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
          {t("Done: {links} created", { links: links(made) })}
          {created.some((r) => r.status === "exists") && t(", the rest already existed")}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary text-sm" onClick={() => copyAll(created)}>{t("Copy all")}</button>
          <button className="btn-ghost border border-line text-sm" onClick={() => downloadCsv(created)}>{t("Download CSV")}</button>
          <Link className="btn-ghost border border-line text-sm" href={`/campaigns/${p.campaign.id}`}>{t("Back to campaign")}</Link>
          <button className="btn-ghost border border-line text-sm" onClick={() => setCreated(null)}>{t("Create more")}</button>
        </div>
        {info && <p className="text-sm text-leads">{info}</p>}
        <ResultTable rows={created} short={short} label={label} t={t} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card grid gap-5 p-6 md:grid-cols-2">
        <div>
          <label className="label">{t("Project code (starts every link)")}</label>
          <input className="input font-mono" value={prefix} onChange={(e) => setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} maxLength={12} />
          <p className={`hint mt-1 ${prefixOk ? "" : "text-danger"}`}>
            {prefixOk
              ? <>{t("2–12 latin letters or digits, unique per campaign. Example:")} <code>{short(`${prefix}-ig-tapter`)}</code></>
              : prefixOwner
                ? t("Already used by «{owner}». Each campaign needs its own code, e.g. {code}.", { owner: prefixOwner, code: `${prefix}2` })
                : t("Use 2–12 latin letters or digits, e.g. tts")}
          </p>
        </div>
        <div>
          <label className="label">{t("Landing page")}</label>
          <input className="input" placeholder="https://aiesecinkz.tilda.ws/…" value={destination} onChange={(e) => setDestination(e.target.value)} />
          <p className="hint mt-1">{t("Where every link leads. A single link can have its own address in the table.")}</p>
        </div>
        {p.domains.length > 1 && (
          <div className="md:col-span-2">
            <label className="label" htmlFor="kit-domain">{t("Short link domain")}</label>
            <select id="kit-domain" className="input max-w-md" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {p.domains.map((d, i) => <option key={d} value={d}>{d}{i === 0 ? ` (${t("main")})` : ""}</option>)}
            </select>
            <p className="hint mt-1">
              {extraDomain
                ? t("The rows become a separate set of links on {domain}, even if the campaign already has them on another domain. To tell the sets apart in “By content”, give the rows their own utm_content.", { domain: extraDomain })
                : t("Links are handed out as {url}.", { url: short("…").replace("…", "slug") })}
            </p>
          </div>
        )}
      </div>

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px]">
            <label className="label">{t("Start from")}</label>
            <select className="input" value={choice} onChange={(e) => void choose(e.target.value)}>
              <optgroup label={t("Templates")}>
                {templates.map((tpl) => (
                  <option key={tpl.name} value={`t:${tpl.name}`}>{t(tpl.name)} ({tpl.rows.length})</option>
                ))}
              </optgroup>
              {p.campaigns.length > 0 && (
                <optgroup label={t("Same as another campaign")}>
                  {p.campaigns.map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>{c.label || c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          {choice.startsWith("t:") && choice.slice(2) !== DEFAULT_TEMPLATE.name && (
            <button className="btn-ghost border border-line text-sm" onClick={() => void deleteTemplate(choice.slice(2))}>{t("Delete template")}</button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-2 font-medium">{t("Name")}</th>
                <th className="py-2 pr-2 font-medium">utm_source</th>
                <th className="py-2 pr-2 font-medium">utm_medium</th>
                <th className="py-2 pr-2 font-medium">utm_content</th>
                <th className="py-2 pr-2 font-medium">{t("Own address (optional)")}</th>
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
                    <td className="py-1.5 pr-2"><input className="input py-1.5" placeholder={t("e.g. Banner")} value={r.label ?? ""} onChange={(e) => setRow(i, { label: e.target.value })} /></td>
                    <td className="py-1.5 pr-2"><input className="input py-1.5" list="kit-sources" value={r.source} onChange={(e) => setRow(i, { source: e.target.value })} /></td>
                    <td className="py-1.5 pr-2"><input className="input py-1.5" list="kit-mediums" value={r.medium} onChange={(e) => setRow(i, { medium: e.target.value })} /></td>
                    <td className="py-1.5 pr-2"><input className="input py-1.5" value={r.content} onChange={(e) => setRow(i, { content: e.target.value })} /></td>
                    <td className="py-1.5 pr-2"><input className="input py-1.5" placeholder={t("landing page")} value={r.destinationUrl ?? ""} onChange={(e) => setRow(i, { destinationUrl: e.target.value })} /></td>
                    <td className="py-1.5 pr-2 font-mono text-xs text-ink-muted">{planned?.slug || "—"}</td>
                    <td className={`py-1.5 pr-2 text-xs ${planned ? STATUS[planned.status].cls : "text-ink-faint"}`}>{planned ? t(STATUS[planned.status].text) : ""}</td>
                    <td className="py-1.5 text-right">
                      <button className="text-ink-faint hover:text-danger" aria-label={t("Remove row")} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</button>
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
            + {t("Custom link")}
          </button>
          <span className="flex items-center gap-2">
            <button className="btn-ghost border border-line text-sm" onClick={() => setRows((rs) => [...rs, ...partnerRows(rs, partners)])}>
              + {t("Info partners")}
            </button>
            <input className="input w-16 py-1.5" type="number" min={1} max={30} value={partners} onChange={(e) => setPartners(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
          </span>
          <span className="flex items-center gap-2">
            <input className="input w-56 py-1.5" placeholder={t("Template name")} value={tplName} onChange={(e) => setTplName(e.target.value)} />
            <button className="btn-ghost border border-line text-sm" disabled={!tplName.trim()} onClick={() => void saveTemplate()}>
              {t("Save as template")}
            </button>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button className="btn-primary" disabled={busy || !prefixOk || !destination.trim() || toCreate === 0} onClick={() => void create()}>
          {busy ? t("Creating…") : t("Create {links}", { links: links(toCreate) })}
        </button>
        {plan.some((r) => r.status === "exists") && (
          <span className="text-sm text-ink-muted">{t("{links} already in the campaign will be skipped", { links: links(plan.filter((r) => r.status === "exists").length) })}</span>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
        {info && <span className="text-sm text-leads">{info}</span>}
      </div>
    </div>
  );
}

function ResultTable({ rows, short, label, t }: { rows: Created; short: (s: string) => string; label: (r: KitRow) => string; t: (s: string) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
            <th className="py-2 pr-3 font-medium">{t("Link")}</th>
            <th className="py-2 pr-3 font-medium">{t("Short URL")}</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.filter((r) => r.slug).map((r) => (
            <tr key={r.slug}>
              <td className="py-2 pr-3 text-ink">{label(r)}</td>
              <td className="py-2 pr-3 font-mono text-xs text-accent">{short(r.slug)}</td>
              <td className={`py-2 text-xs ${STATUS[r.status].cls}`}>{r.status === "new" ? t("created") : t("already existed")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
