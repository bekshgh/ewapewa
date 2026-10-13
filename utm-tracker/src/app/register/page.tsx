"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) setDone(data?.status === "active" ? "active" : "pending");
      else setError(data?.error ?? "Could not register. Try again.");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-sm">
        <div className="card p-6">
          <h1 className="font-display text-xl font-semibold">Create an account</h1>
          {done ? (
            <div className="mt-4 space-y-4 text-sm">
              {done === "pending" ? (
                <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-accent">
                  Done! An admin will approve your account and give you a role. You can sign in after that.
                </p>
              ) : (
                <p className="rounded-xl border border-leads/30 bg-leads/10 px-4 py-3 text-leads">Your admin account is ready.</p>
              )}
              <Link href="/login" className="btn-primary w-full justify-center">Go to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4">
              <div>
                <label className="label">Name</label>
                <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus autoComplete="name" placeholder="Aruzhan K." />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required autoComplete="email" placeholder="your@email.com" />
              </div>
              <div>
                <label className="label">Password</label>
                <input className="input" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={8} autoComplete="new-password" placeholder="at least 8 characters" />
              </div>
              {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                {loading ? "Creating…" : "Create account"}
              </button>
              <p className="text-center text-sm text-ink-faint">
                Already have one? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
