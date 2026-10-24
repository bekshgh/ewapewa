"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { LangSwitch } from "@/components/Sidebar";

export default function RegisterPage() {
  const t = useT();
  const [form, setForm] = useState({ name: "", email: "", password: "", about: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState<"pending" | "active" | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, referrer: document.referrer || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) setDone(data?.status === "active" ? "active" : "pending");
      else setError(data?.error ? t(data.error) : t("Could not register. Try again."));
    } catch {
      setError(t("Connection error. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-sm">
        <div className="card p-6">
          <h1 className="font-display text-xl font-semibold">{t("Create an account")}</h1>
          {done ? (
            <div className="mt-4 space-y-4 text-sm">
              {done === "pending" ? (
                <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-accent">
                  {t("Done! An admin will approve your account and give you a role. You can sign in after that.")}
                </p>
              ) : (
                <p className="rounded-xl border border-leads/30 bg-leads/10 px-4 py-3 text-leads">{t("Your admin account is ready.")}</p>
              )}
              <Link href="/login" className="btn-primary w-full justify-center">{t("Go to sign in")}</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4">
              <div>
                <label className="label">{t("Your name")}</label>
                <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus autoComplete="name" placeholder={t("Aruzhan K.")} />
              </div>
              <div>
                <label className="label" htmlFor="reg-about">{t("Who are you in AIESEC?")}</label>
                <input id="reg-about" className="input" value={form.about} onChange={(e) => set("about", e.target.value)} required minLength={2} maxLength={200} placeholder={t("e.g. OGX team, project manager of Business Cup")} />
                <p className="hint">{t("So the admin knows who you are before giving access.")}</p>
              </div>
              <div>
                <label className="label">{t("Email")}</label>
                <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required autoComplete="email" placeholder="your@email.com" />
              </div>
              <div>
                <label className="label">{t("Password")}</label>
                <input className="input" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={8} autoComplete="new-password" placeholder={t("at least 8 characters")} />
              </div>
              {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                {loading ? t("Creating…") : t("Create account")}
              </button>
              <p className="text-center text-sm text-ink-faint">
                {t("Already have one?")} <Link href="/login" className="text-accent hover:underline">{t("Sign in")}</Link>
              </p>
            </form>
          )}
        </div>
        <LangSwitch className="mt-4 justify-center" />
      </div>
    </div>
  );
}
