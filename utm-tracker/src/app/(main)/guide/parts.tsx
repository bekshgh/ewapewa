/** Building blocks of the guide article, shared by the English and Russian texts. */
export function Section({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-8 first:border-t-0 first:pt-0">
      <h2 className="font-display text-2xl font-bold">
        <span className="mr-2 text-accent">{n}.</span>{title}
      </h2>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

const NOTE = {
  tip: { box: "border-leads/30 bg-leads/5", head: "text-leads", icon: "💡" },
  warn: { box: "border-accent/30 bg-accent/5", head: "text-accent", icon: "⚠️" },
  fix: { box: "border-line bg-bg-base", head: "text-ink", icon: "🛠" },
} as const;

export function Note({ kind, label, children }: { kind: keyof typeof NOTE; label: string; children: React.ReactNode }) {
  const n = NOTE[kind];
  return <div className={`rounded-xl border p-4 text-sm text-ink-muted ${n.box}`}><strong className={n.head}>{n.icon} {label} </strong>{children}</div>;
}

export function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-bg-base px-1.5 py-0.5 text-[13px] text-clicks">{children}</code>;
}

export type GuideSection = { id: string; n: number; t: string };
