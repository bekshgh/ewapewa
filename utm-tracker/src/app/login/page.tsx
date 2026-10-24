"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { LangSwitch } from "@/components/Sidebar";

const REASON: Record<string, string> = {
  pending: "Your account is waiting for an admin's approval.",
  disabled: "Your account is disabled. Ask an admin.",
  declined: "Your sign-up was declined. Ask an admin if this is a mistake.",
}; // t() below

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const reason = REASON[useSearchParams().get("reason") ?? ""];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        setError((res.status === 403 || res.status === 429) && data?.error ? t(data.error) : t("Wrong email or password"));
      }
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">{t("Email")}</label>
              <input
                className="input"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label">{t("Password")}</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {reason && !error && (
              <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">{t(reason)}</p>
            )}

            {error && (
              <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              {loading ? t("Signing in…") : t("Sign in")}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-ink-faint">
            {t("New to the team?")} <Link href="/register" className="text-accent hover:underline">{t("Create an account")}</Link>
          </p>
        </div>
        <LangSwitch className="mt-4 justify-center" />
      </div>
    </div>
  );
}
