"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The extra short-link domains (the main one is fixed). Each must also be added in Vercel → Domains. */
export function LinkDomainsEditor({ domains }: { domains: string[] }) {
  const router = useRouter();
  const [main, ...initial] = domains;
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(next: string[]) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings/link-domains", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domains: next }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMsg({ ok: false, text: body.error ?? "Could not save" });
    setList((body.domains as string[]).slice(1));
    setDraft("");
    setMsg({ ok: true, text: "Saved" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded-xl border border-line text-sm">
        <li className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="font-mono text-ink">{main}</span>
          <span className="text-xs text-ink-faint">main</span>
        </li>
        {list.map((d) => (
          <li key={d} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="font-mono text-ink">{d}</span>
            <button type="button" className="text-xs text-ink-faint hover:text-danger" disabled={busy} onClick={() => save(list.filter((x) => x !== d))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) save([...list, draft.trim()]);
        }}
      >
        <input className="input max-w-sm flex-1" placeholder="zimran-aiesec.vercel.app" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="New domain" />
        <button type="submit" className="btn-primary" disabled={busy || !draft.trim()}>{busy ? "Saving…" : "Add domain"}</button>
      </form>
      {msg && <p className={`text-xs ${msg.ok ? "text-leads" : "text-danger"}`}>{msg.text}</p>}
      <p className="text-xs text-ink-faint">
        First add the domain in Vercel → Project → Settings → Domains, then here. Every domain opens every short link; a link only
        remembers which one to show. Removing a domain here does not break links already handed out with it while it stays in Vercel.
      </p>
    </div>
  );
}
