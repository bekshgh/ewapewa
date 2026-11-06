"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

// A dashboard left open on a screen nobody touches stops refreshing: each refresh
// re-renders the whole page on the server, and that is billed CPU.
const IDLE_MS = 15 * 60 * 1000;
const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Keeps a page's numbers fresh without reloading the site: re-fetches the
 * server data in place (router.refresh) every `every` seconds while the tab
 * is visible and someone used the page in the last 15 minutes, when the tab
 * comes back, and on "Refresh". Scroll position and anything typed on the page stay.
 */
export function LiveRefresh({ every = 300 }: { every?: number }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState<Date | null>(null);
  const last = useRef(0);

  useEffect(() => {
    let active = Date.now();
    const touch = () => { active = Date.now(); };
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      last.current = Date.now();
      start(() => router.refresh());
    };
    setAt(new Date());
    const timer = setInterval(() => { if (Date.now() - active < IDLE_MS) refresh(); }, every * 1000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      touch();
      if (Date.now() - last.current > every * 1000) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    for (const e of ACTIVITY) window.addEventListener(e, touch, { passive: true });
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      for (const e of ACTIVITY) window.removeEventListener(e, touch);
    };
  }, [router, every]);

  // the refresh finished: note the time
  useEffect(() => { if (!pending && last.current) setAt(new Date()); }, [pending]);

  return (
    <button
      type="button"
      onClick={() => { last.current = Date.now(); start(() => router.refresh()); }}
      className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink"
      title={t("Updates by itself every {n} min", { n: Math.round(every / 60) })}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={pending ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden>
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
      </svg>
      {pending ? t("Updating…") : at ? t("Updated {time}", { time: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }) : t("Refresh")}
    </button>
  );
}
