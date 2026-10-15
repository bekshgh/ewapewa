"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** One digit that rolls in from below whenever it changes (odometer style). */
function Digit({ value }: { value: string }) {
  return (
    <span className="relative inline-block h-[1.15em] w-[0.62em] overflow-hidden text-center align-bottom">
      <span key={value} className="absolute inset-0 motion-safe:animate-digit-in">
        {value}
      </span>
    </span>
  );
}

function Rolling({ text }: { text: string }) {
  return (
    <>
      {text.split("").map((ch, i) =>
        /\d/.test(ch) ? <Digit key={i} value={ch} /> : <span key={i} className="motion-safe:animate-colon">{ch}</span>,
      )}
    </>
  );
}

/** A ring that fills over the minute, around a small clock face. */
function SecondsRing({ seconds }: { seconds: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0 -rotate-90">
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" className="stroke-line" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - seconds / 60)}
        // jump back at :00 instead of sweeping backwards
        className={cn("stroke-accent", seconds !== 0 && "motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-linear")}
      />
      <circle cx="12" cy="12" r="1.6" className="fill-accent motion-safe:animate-pulse" />
    </svg>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Live date and time in the viewer's own time zone; `compact` shows the time only (mobile bar). */
export function LiveClock({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, 1000 - d.getMilliseconds() + 5); // stay on the second boundary
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  // Rendered only in the browser: the server does not know the viewer's clock or time zone.
  if (!now) return <div className={cn("h-9", compact ? "w-[86px]" : "w-[236px]", className)} aria-hidden />;

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const raw = now.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
  const date = raw.charAt(0).toUpperCase() + raw.slice(1); // "Чт, 15 октября": only the first letter
  const spoken = now.toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-full border border-line bg-bg-raised/80 py-1.5 pl-2 pr-3.5 shadow-card backdrop-blur motion-safe:animate-fade-up",
        className,
      )}
    >
      <SecondsRing seconds={now.getSeconds()} />
      {!compact && <span className="text-xs text-ink-muted">{date}</span>}
      <time dateTime={now.toISOString()} className="num font-mono text-sm font-medium tabular-nums text-ink" aria-hidden>
        <Rolling text={time} />
      </time>
      <span className="sr-only">{spoken}</span>
    </div>
  );
}
