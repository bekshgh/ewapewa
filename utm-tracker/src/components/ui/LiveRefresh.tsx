"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a page's numbers fresh without reloading the site: re-fetches the
 * server data in place (router.refresh) every `every` seconds while the tab
 * is visible, when the tab comes back, and on "Refresh". Scroll position and
 * anything typed on the page stay.
 */
export function LiveRefresh({ every = 30 }: { every?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState<Date | null>(null);
  const last = useRef(0);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      last.current = Date.now();
      start(() => router.refresh());
    };
    setAt(new Date());
    const timer = setInterval(refresh, every * 1000);
    const onVisible = () => { if (Date.now() - last.current > every * 1000) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [router, every]);

  // the refresh finished: note the time
  useEffect(() => { if (!pending && last.current) setAt(new Date()); }, [pending]);

  return (
    <button
      type="button"
      onClick={() => { last.current = Date.now(); start(() => router.refresh()); }}
      className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink"
      title={`Updates by itself every ${every} seconds`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={pending ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden>
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
      </svg>
      {pending ? "Updating…" : at ? `Updated ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Refresh"}
    </button>
  );
}
