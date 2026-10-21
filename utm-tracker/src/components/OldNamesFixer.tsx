"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeProjectName } from "@/lib/naming";

type Item = { kind: "project" | "campaign"; id: string; name: string; suggested: string | null };

/** Rename projects and campaigns named before the "<Project> F'26" rule. */
export function OldNamesFixer() {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/admin/names", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { items: Item[] }) => {
        setItems(d.items);
        setDraft(Object.fromEntries(d.items.map((i) => [i.id, i.suggested ?? ""])));
      })
      .catch(() => setMsg({ ok: false, text: "Could not load the list" }));
  useEffect(() => { void load(); }, []);

  const ready = (items ?? []).filter((i) => normalizeProjectName(draft[i.id] ?? "") !== null);

  async function rename(list: Item[]) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/names", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: list.map((i) => ({ kind: i.kind, id: i.id, name: draft[i.id] })) }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMsg({ ok: false, text: body.error ?? "Could not rename" });
    setMsg({ ok: true, text: `Renamed ${body.renamed}` });
    await load();
    router.refresh();
  }

  if (!items) return <p className="text-sm text-ink-muted">{msg?.text ?? "Loading…"}</p>;
  if (items.length === 0) return <p className="text-sm text-leads">All names follow the rule.</p>;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="py-2 pr-3 font-medium">Now</th>
              <th className="py-2 pr-3 font-medium">New name</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => {
              const ok = normalizeProjectName(draft[i.id] ?? "") !== null;
              return (
                <tr key={i.id}>
                  <td className="py-2 pr-3 text-ink">
                    {i.name}
                    <div className="text-xs text-ink-faint">{i.kind}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className={`input py-1.5 text-sm ${draft[i.id] && !ok ? "border-danger/60" : ""}`}
                      value={draft[i.id] ?? ""}
                      placeholder="Name F'26"
                      onChange={(e) => setDraft((d) => ({ ...d, [i.id]: e.target.value }))}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button type="button" className="btn-ghost border border-line py-1.5 text-xs" disabled={busy || !ok} onClick={() => rename([i])}>Rename</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy || ready.length === 0} onClick={() => rename(ready)}>
          {busy ? "Renaming…" : `Rename ${ready.length} with a valid new name`}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-leads" : "text-danger"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-ink-faint">
        Suggestions come from a campaign&apos;s season or utm value and a project&apos;s start date; check them before renaming. A campaign&apos;s
        utm_campaign value does not change.
      </p>
    </div>
  );
}
