import { createHash } from "node:crypto";
import { DEFAULT_QUALITY, type Flag, type QualitySettings } from "./settings";

/**
 * Duplicates and fake-record checks, shared by the registration sheet and the
 * oGX leads. Pure functions: personal data goes in, only hashes, masked labels,
 * flags and counts come out.
 */

/** One record as read from a source. */
export interface SourceRow {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  at?: Date | null;
  /** utm_campaign of the record; `undefined` when the source has no UTM notion. */
  utm?: string | null;
  /** Salted IP hash, when the source has one. */
  ipHash?: string | null;
  /** Where to find it again: sheet row number or lead id. */
  ref: string;
}

/** One unique person after deduplication and scoring. */
export interface Person {
  key: string;
  label: string;
  ref: string;
  at: Date | null;
  flags: Flag[];
  riskScore: number;
}

export interface Processed {
  raw: number;
  /** Empty or unusable emails: not counted. */
  invalid: number;
  duplicates: number;
  people: Person[];
}

export type AutoStatus = "valid" | "suspicious" | "quarantined";
export type Decision = "approved" | "rejected";

/* ─── normalisation ─────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GMAIL = new Set(["gmail.com", "googlemail.com"]);

export function normalizeEmail(email: string | null | undefined, gmailCanonical = true): string | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return null;
  const at = e.lastIndexOf("@");
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (gmailCanonical && GMAIL.has(domain)) {
    local = local.split("+")[0].replace(/\./g, "");
    domain = "gmail.com";
    if (!local) return null;
  }
  return `${local}@${domain}`;
}

/** Digits only; a leading 8 on an 11-digit KZ/RU number becomes 7. */
export function normalizePhone(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  return d.length >= 5 ? d : null;
}

export const keyOf = (normalizedEmail: string) => createHash("sha256").update(normalizedEmail).digest("hex");

/** "a***@gmail.com": enough to recognise, not enough to leak. */
export function maskEmail(normalizedEmail: string): string {
  const [local, domain] = normalizedEmail.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/* ─── flags ─────────────────────────────────────────────────────── */

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "10minutemail.com", "10minutemail.net", "tempmail.com",
  "temp-mail.org", "temp-mail.io", "throwawaymail.com", "yopmail.com", "yopmail.net", "getnada.com", "nada.email",
  "trashmail.com", "trashmail.de", "sharklasers.com", "maildrop.cc", "dispostable.com", "fakeinbox.com", "mintemail.com",
  "mohmal.com", "emailondeck.com", "tempail.com", "tempr.email", "spamgourmet.com", "mailnesia.com", "mytemp.email",
  "burnermail.io", "discard.email", "moakt.com", "tmpmail.org", "tmpmail.net", "emailfake.com", "inboxkitten.com",
  "1secmail.com", "1secmail.org", "1secmail.net", "dropmail.me", "minuteinbox.com", "mail.tm", "linshiyouxiang.net",
  "spambox.us", "grr.la", "guerrillamailblock.com", "pokemail.net", "trbvm.com", "mailcatch.com", "tempinbox.com",
]);

/** Common misspellings of real domains and malformed shapes the basic syntax check lets through. */
const DOMAIN_TYPOS = new Set([
  "gmial.com", "gmai.com", "gmal.com", "gmail.co", "gmail.con", "gmail.cm", "gamil.com", "gnail.com", "gmail.ru",
  "mail.ry", "mai.ru", "yandex.ry", "yandx.ru", "yahoo.co", "hotmial.com", "outlok.com", "icloud.co", "iclod.com",
]);

const TEST_RE = /test|тест|asdf|qwerty|йцукен|фыва|sample|example|lorem/i;
const REPEAT_RE = /(.)\1{3,}/; // aaaa
const CONSONANT_RUN_RE = /[bcdfghjklmnpqrstvwxz]{6,}/i;
const VOWEL_RE = /[aeiouyаеёиоуыэюя]/i;

function hasMalformedEmail(normalized: string, original: string): boolean {
  const [local, domain] = normalized.split("@");
  return (
    DOMAIN_TYPOS.has(domain) ||
    /\.\./.test(original) ||
    local.startsWith(".") || local.endsWith(".") ||
    domain.startsWith("-") || /\.-|-\./.test(domain)
  );
}

function isPlaceholderPhone(digits: string): boolean {
  const body = digits.length > 10 ? digits.slice(-10) : digits;
  if (/^(\d)\1+$/.test(body)) return true; // 7777777777, 0000000
  if (/^(\d)\1+$/.test(body.slice(3))) return true; // 777 777 77 77 after a real operator code
  const seq = "01234567890123456789";
  const rev = "98765432109876543210";
  return body.length >= 7 && (seq.includes(body) || rev.includes(body) || seq.includes(body.slice(-7)) || rev.includes(body.slice(-7)));
}

function isGibberish(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const letters = t.replace(/[^a-zа-яё]/gi, "");
  if (CONSONANT_RUN_RE.test(t)) return true;
  return letters.length >= 4 && !VOWEL_RE.test(letters);
}

/** Returns MX presence per domain; a lookup failure or timeout counts as "unknown" (no flag). */
export type MxLookup = (domain: string) => Promise<boolean | null>;

type ResolveMx = (domain: string) => Promise<{ exchange: string }[]>;

const mxCache = new Map<string, boolean | null>();
let dnsHealthy: { ok: boolean; at: number } | null = null;
const CANARY = "gmail.com";

/**
 * MX lookup with a canary: when even gmail.com does not resolve, DNS itself is
 * down (every answer would read "not found"), so all lookups return unknown.
 */
export function dnsMxLookup(timeoutMs: number, resolver?: ResolveMx): MxLookup {
  const resolve = async (domain: string): Promise<boolean | null> => {
    const resolveMx = resolver ?? (await import("node:dns/promises")).resolveMx;
    return Promise.race<boolean | null>([
      resolveMx(domain).then(
        (r) => r.length > 0,
        (e: NodeJS.ErrnoException) => (e?.code === "ENOTFOUND" || e?.code === "ENODATA" ? false : null),
      ),
      new Promise((done) => setTimeout(() => done(null), timeoutMs)),
    ]);
  };
  return async (domain) => {
    if (!dnsHealthy || Date.now() - dnsHealthy.at > 10 * 60_000) {
      dnsHealthy = { ok: (await resolve(CANARY)) === true, at: Date.now() };
    }
    if (!dnsHealthy.ok) return null;
    if (mxCache.has(domain)) return mxCache.get(domain)!;
    const result = await resolve(domain);
    if (result !== null) mxCache.set(domain, result);
    return result;
  };
}

/** For tests: forget cached MX answers and DNS health. */
export function resetMxCache() {
  mxCache.clear();
  dnsHealthy = null;
}

/* ─── pipeline ──────────────────────────────────────────────────── */

export async function processRows(
  rows: SourceRow[],
  opts: { settings?: QualitySettings; mx?: MxLookup | null } = {},
): Promise<Processed> {
  const s = opts.settings ?? DEFAULT_QUALITY;

  // 1. valid emails only; 2. earliest record per person wins
  const byKey = new Map<string, { row: SourceRow; email: string; original: string }>();
  let invalid = 0;
  let duplicates = 0;
  const ordered = [...rows].sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity));
  for (const row of ordered) {
    const email = normalizeEmail(row.email, s.gmailCanonical);
    if (!email) {
      invalid++;
      continue;
    }
    if (byKey.has(email)) {
      duplicates++;
      continue;
    }
    byKey.set(email, { row, email, original: String(row.email ?? "").trim().toLowerCase() });
  }
  const unique = [...byKey.values()];

  // Same phone with different emails: flagged, never merged.
  const phoneCount = new Map<string, number>();
  for (const u of unique) {
    const p = normalizePhone(u.row.phone);
    if (p) phoneCount.set(p, (phoneCount.get(p) ?? 0) + 1);
  }

  // Bursts: many records in the same window sharing an IP (or, without IPs, an email domain).
  const windowMs = Math.max(1, s.burstWindowMin) * 60_000;
  const burstGroups = new Map<string, number>();
  const burstKey = (u: (typeof unique)[number]) =>
    u.row.at ? `${Math.floor(u.row.at.getTime() / windowMs)}|${u.row.ipHash ?? u.email.split("@")[1]}` : null;
  for (const u of unique) {
    const k = burstKey(u);
    if (k) burstGroups.set(k, (burstGroups.get(k) ?? 0) + 1);
  }

  // MX per distinct domain, in parallel, each lookup time-boxed.
  const mxByDomain = new Map<string, boolean | null>();
  if (s.checkMx && opts.mx) {
    const domains = [...new Set(unique.map((u) => u.email.split("@")[1]))].filter((d) => !DISPOSABLE.has(d) && !GMAIL.has(d));
    const results = await Promise.all(domains.map((d) => opts.mx!(d).catch(() => null)));
    domains.forEach((d, i) => mxByDomain.set(d, results[i]));
  }

  const people = unique.map(({ row, email, original }) => {
    const domain = email.split("@")[1];
    const local = email.split("@")[0];
    const name = (row.name ?? "").trim();
    const phone = normalizePhone(row.phone);
    const flags: Flag[] = [];
    if (hasMalformedEmail(email, original)) flags.push("invalid_email_format");
    if (DISPOSABLE.has(domain)) flags.push("disposable_email");
    if (mxByDomain.get(domain) === false) flags.push("no_mx");
    if (TEST_RE.test(local) || TEST_RE.test(name) || REPEAT_RE.test(name)) flags.push("test_words");
    if (isGibberish(local.replace(/[\d._-]/g, "")) || isGibberish(name)) flags.push("gibberish_name_or_email");
    if (phone && isPlaceholderPhone(phone)) flags.push("placeholder_phone");
    const bk = burstKey({ row, email, original });
    if (bk && (burstGroups.get(bk) ?? 0) >= s.burstMinRecords) flags.push("burst");
    if (row.utm !== undefined && !(row.utm ?? "").trim()) flags.push("missing_utm");
    if (phone && (phoneCount.get(phone) ?? 0) > 1) flags.push("possible_duplicate");
    const riskScore = Math.min(100, flags.reduce((sum, f) => sum + (s.weights[f] ?? 0), 0));
    return { key: keyOf(email), label: maskEmail(email), ref: row.ref, at: row.at ?? null, flags, riskScore };
  });

  return { raw: rows.length, invalid, duplicates, people };
}

export function statusOf(riskScore: number, s: QualitySettings = DEFAULT_QUALITY): AutoStatus {
  if (riskScore >= s.thresholds.quarantine) return "quarantined";
  if (riskScore >= s.thresholds.suspicious) return "suspicious";
  return "valid";
}

/* ─── counting policy ───────────────────────────────────────────── */

export interface Scored {
  key: string;
  status: AutoStatus;
  decision: Decision | null;
}

export interface Breakdown {
  raw: number;
  invalid: number;
  duplicates: number;
  unique: number;
  quarantined: number;
  rejected: number;
  /** suspicious, no decision yet */
  pending: number;
  approved: number;
  /** Excluded because countSuspicious is off. */
  suspiciousExcluded: number;
  /** The number used in the ratios. */
  total: number;
  /** valid + approved only. */
  strict: number;
}

/**
 * Counted by default: valid, approved, and suspicious (as "на проверке").
 * Not counted: quarantined and rejected. A decision always wins over the automatic status.
 */
export function countPeople(
  people: Scored[],
  base: { raw: number; invalid: number; duplicates: number },
  countSuspicious: boolean,
): Breakdown {
  const b: Breakdown = { ...base, unique: people.length, quarantined: 0, rejected: 0, pending: 0, approved: 0, suspiciousExcluded: 0, total: 0, strict: 0 };
  for (const p of people) {
    if (p.decision === "rejected") b.rejected++;
    else if (p.decision === "approved") {
      b.approved++;
      b.total++;
      b.strict++;
    } else if (p.status === "quarantined") b.quarantined++;
    else if (p.status === "suspicious") {
      b.pending++;
      if (countSuspicious) b.total++;
      else b.suspiciousExcluded++;
    } else {
      b.total++;
      b.strict++;
    }
  }
  return b;
}
