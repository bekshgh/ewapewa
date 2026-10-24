"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABEL, type Role, type Status } from "@/lib/permissions";
import { relativeTime } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n/client";
import type { SignupInfo } from "@/lib/signupInfo";

type User = {
  id: string; email: string; name: string | null; role: Role; status: Status;
  position: string | null; projectKeys: string[]; lastLoginAt: string | null; createdAt: string;
  about: string | null; signup: SignupInfo | null; decidedAt: string | null; decidedBy: string | null;
};
type Folder = { key: string; title: string };

const ROLE_HINT: Record<Role, string> = {
  admin: "everything, incl. the team and settings",
  manager: "edits the projects below, sees the rest",
  viewer: "sees everything, edits nothing",
};

export function TeamManager({ me, users, folders }: { me: string; users: User[]; folders: Folder[] }) {
  const t = useT();
  const pending = users.filter((u) => u.status === "pending");
  const rest = users.filter((u) => u.status === "active" || u.status === "disabled");
  const declined = users.filter((u) => u.status === "declined").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section className="card p-5">
          <h2 className="font-display text-base font-semibold">{t("Waiting for approval")} · {pending.length}</h2>
          <div className="mt-3 divide-y divide-line">
            {pending.map((u) => <UserRow key={u.id} user={u} folders={folders} me={me} />)}
          </div>
        </section>
      )}
      <section className="card p-5">
        <h2 className="font-display text-base font-semibold">{t("Team")} · {rest.length}</h2>
        {rest.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">{t("No accounts yet. Send your team the sign-up page:")} <code>/register</code>.</p>
        ) : (
          <div className="mt-3 divide-y divide-line">
            {rest.map((u) => <UserRow key={u.id} user={u} folders={folders} me={me} />)}
          </div>
        )}
      </section>
      {declined.length > 0 && (
        <details className="card p-5">
          <summary className="cursor-pointer font-display text-base font-semibold">{t("Declined")} · {declined.length}</summary>
          <p className="mt-1 text-xs text-ink-faint">{t("They cannot sign in. If someone applies again with the same e-mail, they return to the waiting list.")}</p>
          <div className="mt-3 divide-y divide-line">
            {declined.map((u) => <DeclinedRow key={u.id} user={u} />)}
          </div>
        </details>
      )}
    </div>
  );
}

function UserRow({ user, folders, me }: { user: User; folders: Folder[]; me: string }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [role, setRole] = useState<Role>(user.role);
  const [position, setPosition] = useState(user.position ?? "");
  const [keys, setKeys] = useState<string[]>(user.projectKeys);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const self = user.id === me;
  const dirty = role !== user.role || position !== (user.position ?? "") || keys.join() !== user.projectKeys.join();
  const known = new Set(folders.map((f) => f.key));
  const missing = keys.filter((k) => !known.has(k));

  async function call(url: string, init: RequestInit) {
    setBusy(true); setError("");
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { setError(data?.error ?? t("Could not save")); return null; }
    router.refresh();
    window.dispatchEvent(new Event("team:changed")); // the sidebar's sign-ups badge
    return data;
  }
  const save = (extra: Partial<{ status: Status }> = {}) =>
    call(`/api/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ role, position: position || null, projectKeys: role === "manager" ? keys : [], ...extra }) });
  const toggle = (k: string) => setKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium text-ink">
            {user.name || user.email} {self && <span className="text-xs text-ink-faint">({t("you")})</span>}
            {user.status === "disabled" && <span className="ml-2 rounded-md bg-danger/15 px-2 py-0.5 text-xs text-danger">{t("disabled")}</span>}
          </div>
          <div className="text-xs text-ink-faint">
            {user.email} · {user.lastLoginAt ? t("last seen {time}", { time: relativeTime(user.lastLoginAt, lang) }) : t("registered {time}", { time: relativeTime(user.createdAt, lang) })}
          </div>
          <SignupContext user={user} />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {user.status === "pending" && (
            <>
              <button className="btn-primary text-sm" disabled={busy} onClick={() => save({ status: "active" })}>{t("Approve")}</button>
              <button className="btn-ghost text-sm text-danger" disabled={busy} onClick={() => confirm(t("Turn down {email}?", { email: user.email })) && call(`/api/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ status: "declined" }) })}>{t("Decline")}</button>
            </>
          )}
          {user.status !== "pending" && dirty && <button className="btn-primary text-sm" disabled={busy} onClick={() => save()}>{t("Save")}</button>}
          {user.status === "active" && !self && (
            <button className="btn-ghost text-sm" disabled={busy} onClick={() => confirm(t("Disable {email}? They will be signed out.", { email: user.email })) && save({ status: "disabled" })}>{t("Disable")}</button>
          )}
          {user.status === "disabled" && <button className="btn-ghost text-sm" disabled={busy} onClick={() => save({ status: "active" })}>{t("Enable")}</button>}
          {user.status !== "pending" && (
            <button
              className="btn-ghost text-sm"
              disabled={busy}
              onClick={async () => {
                if (!confirm(t("Reset the password of {email}?", { email: user.email }))) return;
                const data = await call(`/api/users/${user.id}/password`, { method: "POST" });
                if (data?.password) setTempPassword(data.password);
              }}
            >
              {t("Reset password")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[180px_220px_1fr]">
        <div>
          <label className="label">{t("Role")}</label>
          <select className="input" value={role} disabled={self} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}
          </select>
          <p className="hint">{t(ROLE_HINT[role])}</p>
        </div>
        <div>
          <label className="label">{t("Position")}</label>
          <input className="input" value={position} onChange={(e) => setPosition(e.target.value)} placeholder={t("VP, R&D manager…")} />
        </div>
        {role === "manager" && (
          <div>
            <label className="label">{t("Projects they edit")}</label>
            <div className="flex flex-wrap gap-2">
              {folders.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggle(f.key)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition ${keys.includes(f.key) ? "border-accent bg-accent/15 text-accent" : "border-line text-ink-muted hover:border-accent/50"}`}
                >
                  {f.title}
                </button>
              ))}
              {missing.map((k) => (
                <button key={k} type="button" onClick={() => toggle(k)} className="rounded-lg border border-danger/40 px-2.5 py-1 text-xs text-danger" title={t("This project folder no longer exists (a campaign was renamed?). Click to remove.")}>
                  {k} ✕
                </button>
              ))}
            </div>
            {keys.length === 0 && <p className="hint">{t("Pick at least one project, or they can only look.")}</p>}
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {tempPassword && (
        <p className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          {t("New password for {email}:", { email: user.email })} <code className="font-mono text-ink">{tempPassword}</code> — {t("send it to them; they can change it in their profile. It is shown only now.")}
        </p>
      )}
    </div>
  );
}

const when = (iso: string, lang: string) =>
  new Date(iso).toLocaleString(lang === "ru" ? "ru-RU" : "en-GB", { timeZone: "Asia/Almaty", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Who is asking: what they wrote, where and on what they signed up, and any earlier decision. */
function SignupContext({ user }: { user: User }) {
  const t = useT();
  const lang = useLang();
  const s = user.signup ?? {};
  let country = s.country;
  try {
    if (s.country) country = new Intl.DisplayNames([lang], { type: "region" }).of(s.country) ?? s.country;
  } catch {}
  const place = [s.city, country].filter(Boolean).join(", ");
  const device = [s.device && t(s.device), s.os, s.browser].filter(Boolean).join(" · ");
  const facts = [
    place && `📍 ${place}`,
    device && `💻 ${device}`,
    s.from && `↪ ${t("came from {site}", { site: s.from })}`,
    s.lang && `🗣 ${s.lang}`,
    `🕓 ${t("signed up {date}", { date: when(user.createdAt, lang) })}`,
  ].filter(Boolean);
  return (
    <div className="mt-1.5 max-w-2xl space-y-1 text-xs">
      {user.about && <p className="text-ink-muted">«{user.about}»</p>}
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-ink-faint">{facts.map((f) => <span key={f as string}>{f}</span>)}</p>
      {user.decidedAt && user.status === "pending" && (
        <p className="text-accent">{t("Declined before: {date}, by {who}", { date: when(user.decidedAt, lang), who: user.decidedBy ?? "—" })}</p>
      )}
      {user.decidedAt && user.status !== "pending" && user.status !== "declined" && user.decidedBy && (
        <p className="text-ink-faint">{t("Approved {date} by {who}", { date: when(user.decidedAt, lang), who: user.decidedBy })}</p>
      )}
    </div>
  );
}

function DeclinedRow({ user }: { user: User }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function call(init: RequestInit) {
    setBusy(true); setError("");
    const res = await fetch(`/api/users/${user.id}`, { headers: { "Content-Type": "application/json" }, ...init });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? t("Could not save"));
    router.refresh();
    window.dispatchEvent(new Event("team:changed"));
  }
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-4">
      <div>
        <div className="font-medium text-ink">{user.name || user.email}</div>
        <div className="text-xs text-ink-faint">
          {user.email}
          {user.decidedAt && <> · <span className="text-danger">{t("declined {date} by {who}", { date: when(user.decidedAt, lang), who: user.decidedBy ?? "—" })}</span></>}
        </div>
        <SignupContext user={user} />
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <button className="btn-ghost border border-line text-sm" disabled={busy} onClick={() => call({ method: "PATCH", body: JSON.stringify({ status: "active", role: "viewer" }) })}>{t("Approve after all")}</button>
        <button className="btn-ghost text-sm text-danger" disabled={busy}
          onClick={() => confirm(t("Delete {email} for good? The record of this sign-up disappears.", { email: user.email })) && call({ method: "DELETE" })}>{t("Delete for good")}</button>
      </div>
    </div>
  );
}
