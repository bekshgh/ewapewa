"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { NewBadge } from "@/components/ui/NewBadge";
import { saveLang, useLang, useT } from "@/lib/i18n/client";
import { LANGS, type Lang } from "@/lib/i18n";

type Access = "all" | "editors" | "admins";

type Item = { href: string; label: string; icon: string; access?: Access; isNew?: boolean };

const NAV: Item[] = [
  { href: "/", label: "Dashboard", icon: "grid" },
  { href: "/links", label: "Links", icon: "link" },
  { href: "/links/new", label: "Create link", icon: "plus", access: "editors" },
  { href: "/analytics", label: "Analytics", icon: "chart" },
  { href: "/leads", label: "Leads", icon: "users" },
  { href: "/campaigns", label: "Campaigns", icon: "flag", isNew: true },
  { href: "/forms", label: "Forms", icon: "form", isNew: true },
  { href: "/projects", label: "Projects", icon: "stack" },
  { href: "/reports", label: "Reports", icon: "doc" },
  { href: "/users", label: "Team", icon: "team", access: "admins" },
];

/** Tucked under "Others". */
const OTHERS: Item[] = [
  { href: "/webhooks", label: "Webhook", icon: "bolt", access: "admins" },
  { href: "/guide", label: "Guideline", icon: "book" },
  { href: "/data", label: "Data", icon: "trash", access: "admins" },
  { href: "/settings", label: "Settings", icon: "cog", access: "admins" },
];

const PENDING_POLL_MS = 60_000;

export interface SidebarUser {
  name: string;
  roleLabel: string;
  admin: boolean;
  /** Admins and project managers. */
  editor: boolean;
  /** Admins waiting to approve someone. */
  pending: number;
}

function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.JSX.Element> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>,
    plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
    chart: <><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></>,
    form: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    team: <><circle cx="8" cy="9" r="2.5" /><circle cx="16" cy="9" r="2.5" /><path d="M3 19a5 5 0 0 1 10 0M11 19a5 5 0 0 1 10 0" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" /></>,
    flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 3 2 3H5" /></>,
    stack: <><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /></>,
    doc: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 17v-3M12 17v-6M15 17v-4" /></>,
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
    book: <><path d="M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 0-2 2V4Z" /><path d="M5 18h14" /></>,
    cog: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
    more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const t = useT();
  const allowed = (i: Item) => !i.access || i.access === "all" || (i.access === "admins" ? user.admin : user.editor);
  const items = NAV.filter(allowed);
  const others = OTHERS.filter(allowed);
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const inOthers = others.some((i) => isActive(i.href));
  const [othersOpen, setOthersOpen] = useState(inOthers);
  useEffect(() => { if (inOthers) setOthersOpen(true); }, [inOthers]);

  // Sign-ups waiting for approval: the layout's count, then kept fresh without a reload.
  const [pending, setPending] = useState(user.pending);
  useEffect(() => {
    if (!user.admin) return;
    let stop = false;
    const load = () =>
      fetch("/api/users/pending", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!stop && d && typeof d.pending === "number") setPending(d.pending); })
        .catch(() => {});
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, PENDING_POLL_MS);
    window.addEventListener("team:changed", load);
    return () => { stop = true; clearInterval(t); window.removeEventListener("team:changed", load); };
  }, [user.admin, pathname]);

  const row = (item: Item, nested = false) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={() => setOpen(false)}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
        nested && "py-2 pl-6",
        isActive(item.href)
          ? "bg-bg-hover text-ink font-medium"
          : "text-ink-muted hover:bg-bg-raised hover:text-ink"
      )}
    >
      <span className={cn("transition", isActive(item.href) ? "text-accent" : "text-ink-faint group-hover:text-ink-muted")}>
        <Icon name={item.icon} />
      </span>
      {t(item.label)}
      {item.isNew && <NewBadge className="ml-auto" />}
      {item.href === "/users" && pending > 0 && (
        <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-bg-base" title={t("Sign-ups waiting for approval: {n}", { n: pending })}>
          {pending}
        </span>
      )}
    </Link>
  );

  const Nav = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => row(item))}
      {others.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOthersOpen((v) => !v)}
            aria-expanded={othersOpen}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
              inOthers && !othersOpen ? "bg-bg-hover text-ink font-medium" : "text-ink-muted hover:bg-bg-raised hover:text-ink"
            )}
          >
            <span className={cn("transition", inOthers ? "text-accent" : "text-ink-faint group-hover:text-ink-muted")}>
              <Icon name="more" />
            </span>
            {t("Others")}
            <span className={cn("ml-auto text-ink-faint transition-transform", othersOpen && "rotate-90")}>
              <Icon name="chevron" />
            </span>
          </button>
          {othersOpen && others.map((item) => row(item, true))}
        </>
      )}
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-line bg-bg-base/80 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button onClick={() => setOpen((v) => !v)} className="btn-ghost px-3 py-2" aria-label={t("Menu")}>
          <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 top-[57px] z-30 overflow-y-auto bg-bg-base/95 px-4 py-4 backdrop-blur lg:hidden">
          {Nav}
          <Link href="/profile" onClick={() => setOpen(false)} className="mt-3 block rounded-xl px-3 py-2.5 text-sm text-ink-muted">{user.name} · {t("Profile")}</Link>
          <LangSwitch />
          <LogoutButton />
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-bg-base/60 px-4 py-6 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <div className="mt-8 flex-1">{Nav}</div>
        <Link href="/profile" className="block rounded-xl border border-line bg-bg-raised p-3 text-xs transition hover:border-accent/50">
          <p className="truncate font-medium text-ink">{user.name}</p>
          <p className="mt-0.5 text-ink-faint">{t(user.roleLabel)} · {t("Profile")} →</p>
        </Link>
        <LangSwitch />
        <LogoutButton />
      </aside>

      <div className="h-[57px] shrink-0 lg:hidden" />
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="font-display text-lg font-bold tracking-tight">EwA Tracker</span>
    </Link>
  );
}

/** RU / EN: remembered in a cookie, the page re-renders in place. */
export function LangSwitch({ className = "mt-3" }: { className?: string }) {
  const lang = useLang();
  const router = useRouter();
  const t = useT();
  const pick = (l: Lang) => { saveLang(l); router.refresh(); };
  return (
    <div className={cn("flex items-center gap-1 px-3 text-xs", className)} role="group" aria-label={t("Interface language")}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          aria-pressed={lang === l}
          className={cn("rounded-md px-2 py-1 transition", lang === l ? "bg-bg-hover font-medium text-ink" : "text-ink-faint hover:text-ink")}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function LogoutButton() {
  const t = useT();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button
      onClick={logout}
      className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-ink-faint transition hover:bg-bg-raised hover:text-danger"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {t("Sign out")}
    </button>
  );
}
