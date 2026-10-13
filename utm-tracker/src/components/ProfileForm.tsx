"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileForm({ name: initialName }: { name: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, string>, done: string) {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: data?.error ?? "Could not save" }); return; }
    setMsg({ ok: true, text: done });
    setCurrent(""); setNew("");
    router.refresh();
  }

  return (
    <section className="card p-5">
      <h2 className="font-display text-base font-semibold">Your account</h2>
      <div className="mt-4 space-y-4">
        <div>
          <label className="label">Name</label>
          <div className="flex gap-2">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-ghost text-sm" disabled={busy || name.trim() === initialName} onClick={() => save({ name }, "Name saved")}>Save</button>
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <label className="label">Change password</label>
          <input className="input" type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          <input className="input mt-2" type="password" placeholder="New password (8+ characters)" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" />
          <button className="btn-primary mt-3 text-sm" disabled={busy || !currentPassword || newPassword.length < 8} onClick={() => save({ currentPassword, newPassword }, "Password changed")}>
            Change password
          </button>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-leads" : "text-danger"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}
