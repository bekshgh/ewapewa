/**
 * Building a campaign's whole set of UTM links at once ("Создать utm-ссылки").
 * Pure helpers, safe to use in the browser and on the server.
 *
 * Slugs read as <project prefix>-<source>-<content>, e.g. tts-tg-rassylka.
 * The prefix is the campaign's own short code (Campaign.slugPrefix, unique),
 * so links of different projects never collide.
 */

export interface KitRow {
  /** Human name of the link, e.g. "Tapter"; the link is named "<campaign> — <label>". */
  label?: string;
  source: string;
  medium: string;
  content: string;
  /** Only when this link goes somewhere other than the kit's destination. */
  destinationUrl?: string;
}

export interface KitTemplate {
  name: string;
  rows: KitRow[];
}

/**
 * The channels of a project campaign. UTM values reuse those of
 * TopTalents Sprint F'26 where it had the channel (tapter, telegram,
 * infopartnerN, mailing, rassylka); the rest are new.
 */
export const DEFAULT_TEMPLATE: KitTemplate = {
  name: "Project set",
  rows: [
    { label: "Tapter", source: "instagram", medium: "bio", content: "tapter" },
    { label: "Target ads", source: "instagram", medium: "cpc", content: "target" },
    { label: "Telegram", source: "telegram", medium: "social", content: "telegram" },
    { label: "Info partner 1", source: "referral", medium: "referral", content: "infopartner1" },
    { label: "Info partner 2", source: "referral", medium: "referral", content: "infopartner2" },
    { label: "Info partner 3", source: "referral", medium: "referral", content: "infopartner3" },
    { label: "Info partner 4", source: "referral", medium: "referral", content: "infopartner4" },
    { label: "Info partner 5", source: "referral", medium: "referral", content: "infopartner5" },
    { label: "Mailing", source: "email", medium: "email", content: "mailing" },
    { label: "Telegram mailing 1", source: "telegram", medium: "message", content: "rassylka" },
    { label: "Telegram mailing 2", source: "telegram", medium: "message", content: "rassylka2" },
    { label: "Promo video", source: "instagram", medium: "social", content: "promo_video" },
    { label: "Banner", source: "qr", medium: "offline", content: "banner" },
    { label: "Small banner", source: "qr", medium: "offline", content: "small_banner" },
    { label: "NU Space", source: "qr", medium: "offline", content: "nu_space" },
    { label: "Promo Lower Atrium", source: "qr", medium: "offline", content: "lower_atrium" },
  ],
};

export const PREFIX_RE = /^[a-z0-9]{2,12}$/;

const SOURCE_ABBR: Record<string, string> = {
  telegram: "tg",
  instagram: "ig",
  email: "em",
  facebook: "fb",
  tiktok: "tt",
  youtube: "yt",
  google: "g",
  whatsapp: "wa",
  referral: "ref",
  linkedin: "li",
  website: "web",
  threads: "th",
  qr: "qr",
};

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "",
  ы: "y", ь: "", э: "e", ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** Lower-case latin letters, digits and single dashes. */
export function slugPart(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** UTM values are stored lower-case with no spaces, like the existing links. */
export function cleanUtm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

export function cleanRow(r: KitRow): KitRow {
  const row: KitRow = { source: cleanUtm(r.source), medium: cleanUtm(r.medium), content: cleanUtm(r.content) };
  const label = r.label?.trim();
  if (label) row.label = label.slice(0, 80);
  const dest = r.destinationUrl?.trim();
  if (dest) row.destinationUrl = dest;
  return row;
}

export const rowKey = (r: Pick<KitRow, "source" | "medium" | "content">) =>
  `${cleanUtm(r.source)}|${cleanUtm(r.medium)}|${cleanUtm(r.content)}`;

/** "TopTalents Sprint F'26" → "tts": initials of the words, season tokens left out. */
export function suggestPrefix(label: string): string {
  const words = label
    .replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, "$1 $2")
    .split(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі0-9']+/)
    .filter((w) => w && !/[0-9']/.test(w));
  const initials = slugPart(words.map((w) => w[0]).join("")).replace(/-/g, "");
  if (initials.length >= 2) return initials.slice(0, 12);
  return slugPart(label).replace(/-/g, "").slice(0, 6) || "proj";
}

export function slugFor(prefix: string, r: KitRow): string {
  const src = SOURCE_ABBR[cleanUtm(r.source)] ?? slugPart(r.source);
  const tail = slugPart(r.content) || slugPart(r.medium);
  return [prefix, src, tail].filter(Boolean).join("-").replace(/-+/g, "-").slice(0, 40).replace(/-+$/, "");
}

export interface ExistingLink {
  slug: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmContent: string | null;
}

export type PlannedRow = KitRow & {
  slug: string;
  /** new: will be created; exists: the campaign already has this link; duplicate: repeated row in the kit. */
  status: "new" | "exists" | "duplicate";
};

/**
 * Which rows become new links and with what slug. A row whose
 * source / medium / content the campaign already has is skipped (shows the
 * existing slug), so running the kit twice adds nothing. Taken slugs get a
 * numeric suffix.
 */
export function planKit(prefix: string, rows: KitRow[], campaignLinks: ExistingLink[], takenSlugs: Iterable<string>): PlannedRow[] {
  const existing = new Map(
    campaignLinks.map((l) => [rowKey({ source: l.utmSource ?? "", medium: l.utmMedium ?? "", content: l.utmContent ?? "" }), l.slug]),
  );
  const taken = new Set(takenSlugs);
  const seen = new Set<string>();
  return rows.map((raw) => {
    const r = cleanRow(raw);
    const key = rowKey(r);
    if (existing.has(key)) return { ...r, slug: existing.get(key)!, status: "exists" };
    if (seen.has(key)) return { ...r, slug: "", status: "duplicate" };
    seen.add(key);
    const base = slugFor(prefix, r);
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    taken.add(slug);
    return { ...r, slug, status: "new" };
  });
}

/** referral / referral / infopartnerN rows, numbered after the ones already in the list. */
export function partnerRows(current: KitRow[], count: number): KitRow[] {
  let max = 0;
  for (const r of current) {
    const m = /^infopartner(\d+)$/.exec(cleanUtm(r.content));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return Array.from({ length: count }, (_, i) => ({
    label: `Info partner ${max + i + 1}`,
    source: "referral",
    medium: "referral",
    content: `infopartner${max + i + 1}`,
  }));
}
