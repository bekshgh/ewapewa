import crypto from "crypto";

/** Tailwind classnames merge (lightweight). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars

/** Random short slug for /r/{slug}. */
export function generateSlug(length = 7): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  return out;
}

/** Unique, hard-to-guess click id forwarded to Tilda. */
export function generateClickId(): string {
  return "clk_" + crypto.randomBytes(16).toString("hex");
}

/** One-way hash of an IP. We never persist the raw IP. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || "default-salt";
  return crypto.createHash("sha256").update(ip + salt).digest("hex").slice(0, 32);
}

/** Stable key to deduplicate leads coming from repeated webhooks. */
export function buildDedupeKey(parts: {
  clickId?: string | null;
  email?: string | null;
  phone?: string | null;
  formName?: string | null;
  submittedAt?: Date | string | null;
}): string {
  if (parts.clickId) return "ck:" + parts.clickId;
  const day =
    parts.submittedAt instanceof Date
      ? parts.submittedAt.toISOString().slice(0, 10)
      : String(parts.submittedAt ?? "").slice(0, 10);
  const ident = (parts.email || parts.phone || "anon").toLowerCase().trim();
  const raw = `${ident}|${parts.formName ?? ""}|${day}`;
  return "id:" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function conversionRate(leads: number, clicks: number): number {
  if (!clicks) return 0;
  return (leads / clicks) * 100;
}

/** The team's time zone: dates and day buckets everywhere are Almaty time, not the server's (UTC on Vercel). */
export const TIME_ZONE = "Asia/Almaty";

/** "2026-10-21" — the calendar day of a moment in the team's time zone. */
export function localDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

/** Build the destination URL with UTM + click_id appended. */
export function buildDestinationUrl(
  destination: string,
  utm: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
  },
  customParams: Record<string, string> | null,
  clickId: string | null
): string {
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    // destination without protocol — assume https
    url = new URL("https://" + destination.replace(/^\/+/, ""));
  }
  const set = (k: string, v?: string | null) => {
    if (v) url.searchParams.set(k, v);
  };
  set("utm_source", utm.utmSource);
  set("utm_medium", utm.utmMedium);
  set("utm_campaign", utm.utmCampaign);
  set("utm_content", utm.utmContent);
  set("utm_term", utm.utmTerm);
  if (customParams) for (const [k, v] of Object.entries(customParams)) set(k, v);
  if (clickId) url.searchParams.set("click_id", clickId);
  return url.toString();
}
