"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UTM_SOURCES, UTM_MEDIUMS } from "@/lib/constants";
import { generateSlug } from "@/lib/utils";
import { CopyButton } from "@/components/ui/CopyButton";
import { shortUrl as buildShortUrl, storedDomain } from "@/lib/linkDomains";

type Campaign = { id: string; name: string; label: string | null };

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "";

export function CreateLinkForm({ campaigns, domains = [] }: { campaigns: Campaign[]; domains?: string[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    destinationUrl: "",
    campaignId: "",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    utmContent: "",
    utmTerm: "",
    notes: "",
    shortDomain: domains[0] ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // when a campaign is picked, mirror its name into utm_campaign
  const onCampaign = (id: string) => {
    const c = campaigns.find((x) => x.id === id);
    setForm((f) => ({ ...f, campaignId: id, utmCampaign: c ? c.name : f.utmCampaign }));
  };

  const shortUrl = buildShortUrl(BASE, form.slug || "[slug]", storedDomain(BASE, form.shortDomain));

  const fullUtmUrl = useMemo(() => {
    if (!form.destinationUrl) return "—";
    try {
      const u = new URL(form.destinationUrl);
      const add = (k: string, v: string) => v && u.searchParams.set(k, v);
      add("utm_source", form.utmSource);
      add("utm_medium", form.utmMedium);
      add("utm_campaign", form.utmCampaign);
      add("utm_content", form.utmContent);
      add("utm_term", form.utmTerm);
      u.searchParams.set("click_id", "{generated}");
      return u.toString();
    } catch {
      return form.destinationUrl;
    }
  }, [form]);

  async function submit() {
    setSaving(true);
    setErrors({});
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        slug: form.slug || generateSlug(),
        campaignId: form.campaignId || null,
        shortDomain: storedDomain(BASE, form.shortDomain),
      }),
    });
    if (res.ok) {
      router.push("/links");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setErrors(j.issues || {});
      setSaving(false);
    }
  }

  const err = (k: string) => errors[k]?.[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {/* form */}
      <div className="space-y-7">
        <Field label="Description (for your team)" hint="What this link represents — e.g. “Instagram story, May 30”." error={err("name")}>
          <input className="input" placeholder="ICY Spring'26 — Instagram story" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>

        {domains.length > 1 && (
          <Field label="Short link domain" hint="Every domain opens the link; this is the one it is shown and copied with." error={err("shortDomain")}>
            <select className="input" value={form.shortDomain} onChange={(e) => set("shortDomain", e.target.value)}>
              {domains.map((d, i) => <option key={d} value={d}>{d}{i === 0 ? " (main)" : ""}</option>)}
            </select>
          </Field>
        )}

        <Field label="Short link slug" hint={`Your tracking link: ${shortUrl.replace(/^https?:\/\//, "")}`} error={err("slug")}>
          <div className="flex gap-2">
            <input className="input" placeholder="leave empty for auto" value={form.slug} onChange={(e) => set("slug", e.target.value)} />
            <button type="button" className="btn-ghost shrink-0" onClick={() => set("slug", generateSlug())}>Generate</button>
          </div>
        </Field>

        <Field label="Destination URL" hint="Where people land — usually your registration page." error={err("destinationUrl")}>
          <input className="input" placeholder="https://aieseckz.tilda.ws" value={form.destinationUrl} onChange={(e) => set("destinationUrl", e.target.value)} />
        </Field>

        <div className="grid gap-7 sm:grid-cols-2">
          <Field label="Source (utm_source)" hint="Where the traffic comes from." error={err("utmSource")}>
            <select className="input" value={form.utmSource} onChange={(e) => set("utmSource", e.target.value)}>
              <option value="">Select source…</option>
              {UTM_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          <Field label="Medium (utm_medium)" hint="Type of traffic — ad, post, email…" error={err("utmMedium")}>
            <select className="input" value={form.utmMedium} onChange={(e) => set("utmMedium", e.target.value)}>
              <option value="">Select medium…</option>
              {UTM_MEDIUMS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Campaign (utm_campaign)" hint="Pick a campaign or type a name below.">
          <select className="input" value={form.campaignId} onChange={(e) => onCampaign(e.target.value)}>
            <option value="">No campaign</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label || c.name} ({c.name})</option>)}
          </select>
          <input className="input mt-2" placeholder="utm_campaign value, e.g. icy_s26" value={form.utmCampaign} onChange={(e) => set("utmCampaign", e.target.value)} />
        </Field>

        <Field label="Content (utm_content)" hint="Specific placement — story_may30, bio_link, ad_video_v1.">
          <input className="input" placeholder="story_may30" value={form.utmContent} onChange={(e) => set("utmContent", e.target.value)} />
        </Field>

        <Field label="Term (utm_term) — optional" hint="Keyword or audience targeting (mostly for paid ads).">
          <input className="input" placeholder="youth_almaty" value={form.utmTerm} onChange={(e) => set("utmTerm", e.target.value)} />
        </Field>

        <Field label="Notes — optional" hint="Anything else your team should know.">
          <textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        <div className="flex gap-3">
          <button className="btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Creating…" : "Create link"}
          </button>
          <button className="btn-ghost" onClick={() => { setForm({ name: "", slug: "", destinationUrl: "", campaignId: "", utmSource: "", utmMedium: "", utmCampaign: "", utmContent: "", utmTerm: "", notes: "", shortDomain: domains[0] ?? "" }); setErrors({}); }}>
            Reset
          </button>
        </div>
      </div>

      {/* preview */}
      <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
        <h2 className="font-display text-lg font-semibold">Live preview</h2>

        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Short URL</p>
          <p className="mt-1.5 break-all text-sm text-accent">{shortUrl}</p>
          <CopyButton value={shortUrl} className="mt-2 inline-block" />
        </div>

        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Full destination with UTM</p>
          <p className="mt-1.5 break-all text-xs leading-relaxed text-ink-muted">{fullUtmUrl}</p>
        </div>

        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Parameters</p>
          <dl className="mt-2 divide-y divide-line text-sm">
            {[
              ["utm_source", form.utmSource],
              ["utm_medium", form.utmMedium],
              ["utm_campaign", form.utmCampaign],
              ["utm_content", form.utmContent],
              ["utm_term", form.utmTerm],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2">
                <dt className="text-ink-muted">{k}</dt>
                <dd className={v ? "text-ink" : "text-ink-faint"}>{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="rounded-xl border border-line bg-bg-raised p-3 text-xs leading-relaxed text-ink-faint">
          <strong className="text-ink-muted">click_id</strong> is generated automatically on every click and forwarded to your destination — that&apos;s what links a lead back to its exact click.
        </p>
      </aside>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error ? <p className="hint text-danger">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}
