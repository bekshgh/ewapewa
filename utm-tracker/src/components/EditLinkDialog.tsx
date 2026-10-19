"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UTM_MEDIUMS, UTM_SOURCES } from "@/lib/constants";

type Form = {
  shortDomain: string;
  name: string;
  destinationUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  notes: string;
};

const FIELDS: { k: keyof Form; label: string; list?: string; hint?: string }[] = [
  { k: "utmSource", label: "utm_source", list: "edit-link-sources" },
  { k: "utmMedium", label: "utm_medium", list: "edit-link-mediums" },
  { k: "utmCampaign", label: "utm_campaign", hint: "Moves the link to the campaign with this value" },
  { k: "utmContent", label: "utm_content" },
  { k: "utmTerm", label: "utm_term" },
];

/**
 * Edit a link in place: description, landing page, UTM tags, notes. The short
 * address (/r/…) stays — it may already be printed on QR codes or sent out.
 */
export function EditLinkDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    fetch(`/api/links/${id}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (stop) return;
        if (!ok) return setError(body.error ?? "Could not load the link");
        setSlug(body.slug);
        setDomains(body.domains ?? []);
        setForm({
          shortDomain: body.shortDomain ?? body.domains?.[0] ?? "",
          name: body.name ?? "", destinationUrl: body.destinationUrl ?? "",
          utmSource: body.utmSource ?? "", utmMedium: body.utmMedium ?? "", utmCampaign: body.utmCampaign ?? "",
          utmContent: body.utmContent ?? "", utmTerm: body.utmTerm ?? "", notes: body.notes ?? "",
        });
      })
      .catch(() => !stop && setError("Could not load the link"));
    return () => { stop = true; };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // the main domain is stored as empty
      body: JSON.stringify({ ...form, shortDomain: form.shortDomain === domains[0] ? null : form.shortDomain, name: form.name.trim(), destinationUrl: form.destinationUrl.trim() }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      const issue = body.issues && (Object.values(body.issues) as string[][]).flat()[0];
      return setError(issue ?? body.error ?? "Could not save");
    }
    router.refresh();
    onClose();
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-xl space-y-4 p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-link-title"
      >
        <div>
          <h2 id="edit-link-title" className="font-display text-lg font-semibold">Edit link</h2>
          {slug && <p className="mt-1 text-xs text-ink-faint">The slug <span className="font-mono text-clicks">/r/{slug}</span> stays the same, so printed QR codes keep working (every domain opens it).</p>}
        </div>

        {!form && !error && <p className="text-sm text-ink-muted">Loading…</p>}

        {form && (
          <>
            <div>
              <label className="label" htmlFor="el-name">Description</label>
              <input id="el-name" className="input" required maxLength={120} value={form.name} onChange={set("name")} />
            </div>
            {domains.length > 1 && (
              <div>
                <label className="label" htmlFor="el-domain">Short link domain</label>
                <select id="el-domain" className="input" value={form.shortDomain} onChange={set("shortDomain")}>
                  {domains.map((d, i) => <option key={d} value={d}>{d}{i === 0 ? " (main)" : ""}</option>)}
                </select>
                <p className="hint">The domain the link is shown and copied with: https://{form.shortDomain}/r/{slug}</p>
              </div>
            )}
            <div>
              <label className="label" htmlFor="el-dest">Landing page</label>
              <input id="el-dest" className="input" type="url" required value={form.destinationUrl} onChange={set("destinationUrl")} placeholder="https://…" />
              <p className="hint">Where the short link sends people. UTM tags and click_id are added to it on every click.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.k}>
                  <label className="label" htmlFor={`el-${f.k}`}>{f.label}</label>
                  <input id={`el-${f.k}`} className="input" maxLength={120} list={f.list} value={form[f.k]} onChange={set(f.k)} />
                  {f.hint && <p className="hint">{f.hint}</p>}
                </div>
              ))}
            </div>
            <datalist id="edit-link-sources">{UTM_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>
            <datalist id="edit-link-mediums">{UTM_MEDIUMS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>
            <div>
              <label className="label" htmlFor="el-notes">Notes</label>
              <textarea id="el-notes" className="input min-h-[64px]" maxLength={500} value={form.notes} onChange={set("notes")} />
            </div>
            <p className="text-xs text-ink-faint">New tags apply from the next click. Leads already recorded keep the tags they came with; the link&apos;s clicks stay with the link.</p>
          </>
        )}

        {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!form || busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
