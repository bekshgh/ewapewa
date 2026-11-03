import { detectColumns, parseDate } from "@/lib/attendanceForecast/forecastCore";

/**
 * Registration check: the form's own export (e.g. Zimran's candidate list) against the project's
 * leads on the site, person by person (e-mail, else phone). Runs in the browser: the uploaded file
 * is never sent anywhere; the site's leads come from the folder's API.
 */

/** One lead of the folder, as the API hands it to the browser. */
export interface SiteLead {
  email: string | null;
  phone: string | null;
  /** Almaty wall-clock time, "YYYY-MM-DD HH:MM". */
  at: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  /** link — came through a tracker link; direct — no link (utm_source=direct); import — a sheet imported in Data; form — a webhook. */
  kind: "link" | "direct" | "import" | "form";
}

export type FileField = "email" | "phone" | "createdAt" | "tag";

/** Header synonyms of the export's tag column (Zimran: «Метка», "instagram-bio-tapter"). */
const TAG_ALIASES = ["метка", "метки", "utm", "tag", "label", "канал", "источник"];

/** Maps each field to the header that holds it. */
export function detectFileColumns(headers: string[]): Partial<Record<FileField, string>> {
  const base = detectColumns(headers);
  const map: Partial<Record<FileField, string>> = {};
  if (base.email) map.email = base.email;
  if (base.phone) map.phone = base.phone;
  if (base.createdAt) map.createdAt = base.createdAt;
  const used = new Set(Object.values(map));
  const norm = headers.map((h) => h.toLowerCase().trim());
  for (const syn of TAG_ALIASES) {
    let i = norm.findIndex((h, k) => !used.has(headers[k]) && h === syn);
    if (i < 0) i = norm.findIndex((h, k) => !used.has(headers[k]) && !!h && h.includes(syn));
    if (i >= 0) { map.tag = headers[i]; break; }
  }
  return map;
}

/** The sheet to compare: the first one with an e-mail or phone column and rows. */
export function pickReconcileSheet(sheets: { name: string; headers: string[]; objects: unknown[] }[]): string | null {
  for (const s of sheets) {
    const m = detectFileColumns(s.headers);
    if ((m.email || m.phone) && s.objects.length) return s.name;
  }
  return sheets[0]?.name ?? null;
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const normEmail = (v: unknown) => text(v).toLowerCase();
/** Last 10 digits: +7 701…, 8 701… and 701… are one number. */
const normPhone = (v: unknown) => { const d = text(v).replace(/\D/g, ""); return d.length >= 7 ? d.slice(-10) : ""; };
const normTag = (v: unknown) => text(v).toLowerCase();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** How the site writes a lead's channel, the way the export writes its tag: source-medium-content. */
export function siteTag(l: Pick<SiteLead, "source" | "medium" | "campaign" | "content">): string {
  if (!l.source || l.source.toLowerCase() === "direct") return "";
  return [l.source, l.medium, l.content || l.campaign].filter(Boolean).join("-").toLowerCase();
}
/** The export's tag matches the lead's: any of the usual ways to glue its UTM together. */
function sameTag(fileTag: string, l: SiteLead): boolean {
  const s = siteTag(l);
  if (!fileTag || !s) return !fileTag && !s;
  const parts = (xs: (string | null)[]) => xs.filter(Boolean).join("-").toLowerCase();
  return [s, parts([l.source, l.medium, l.campaign]), parts([l.source, l.medium, l.content]), parts([l.source, l.medium]), parts([l.source, l.medium, l.campaign, l.content])].includes(fileTag);
}

export interface FilePerson { contact: string; at: string | null; tag: string }
export interface SitePerson { contact: string; at: string; tag: string; kind: SiteLead["kind"] }
export interface TagDiff { contact: string; at: string | null; fileTag: string; siteTag: string; kind: SiteLead["kind"] }

export interface Reconciliation {
  file: { rows: number; people: number; repeats: number; noContact: number; from: string | null; to: string | null };
  site: { leads: number; people: number; noContact: number; outside: number; byKind: Record<SiteLead["kind"], number> };
  matched: number;
  onlyFile: FilePerson[];
  onlySite: SitePerson[];
  tags: { same: number; bothEmpty: number; fileOnly: number; siteOnly: number; different: number };
  tagDiffs: TagDiff[];
  /** "Only in the file" by the file's tag, "only on the site" by the site's. */
  onlyFileByTag: { tag: string; n: number }[];
  onlySiteByTag: { tag: string; n: number }[];
  /** Matched people whose tags differ: file tag → site tag. */
  pairs: { fileTag: string; siteTag: string; n: number }[];
  byDay: { day: string; file: number; site: number; matched: number }[];
}

/** Leads this long after the file's last row were sent after the export was made. */
const AFTER_EXPORT_MS = 10 * 60_000;

export function reconcile(objects: Record<string, unknown>[], map: Partial<Record<FileField, string>>, leads: SiteLead[]): Reconciliation {
  const get = (o: Record<string, unknown>, f: FileField) => (map[f] ? o[map[f]!] : null);

  // the file: one person per e-mail (else phone), their first row
  type FP = { email: string; phone: string; at: Date | null; tag: string };
  const filePeople = new Map<string, FP>();
  let noContactFile = 0, fileRows = 0;
  for (const o of objects) {
    const email = normEmail(get(o, "email")), phone = normPhone(get(o, "phone"));
    const at = parseDate(get(o, "createdAt"));
    const tag = normTag(get(o, "tag"));
    if (!email && !phone && !at && !tag) continue; // an empty line
    fileRows++;
    const key = email || (phone && `tel:${phone}`);
    if (!key) { noContactFile++; continue; }
    const prev = filePeople.get(key);
    if (!prev) filePeople.set(key, { email, phone, at, tag });
    else {
      if (at && (!prev.at || at < prev.at)) prev.at = at;
      if (!prev.tag && tag) prev.tag = tag;
    }
  }
  const dates = [...filePeople.values()].map((p) => p.at).filter((d): d is Date => !!d).sort((a, b) => +a - +b);
  const from = dates[0] ?? null, to = dates[dates.length - 1] ?? null;

  // the site: index leads by e-mail and phone
  const byEmail = new Map<string, SiteLead[]>(), byPhone = new Map<string, SiteLead[]>();
  const byKind = { link: 0, direct: 0, import: 0, form: 0 };
  let noContactSite = 0;
  for (const l of leads) {
    byKind[l.kind]++;
    const e = normEmail(l.email), p = normPhone(l.phone);
    if (!e && !p) { noContactSite++; continue; }
    if (e) (byEmail.get(e) ?? byEmail.set(e, []).get(e)!).push(l);
    if (p) (byPhone.get(p) ?? byPhone.set(p, []).get(p)!).push(l);
  }

  const used = new Set<SiteLead>();
  const tags = { same: 0, bothEmpty: 0, fileOnly: 0, siteOnly: 0, different: 0 };
  const onlyFile: FilePerson[] = [];
  const tagDiffs: TagDiff[] = [];
  const pairs = new Map<string, { fileTag: string; siteTag: string; n: number }>();
  const days = new Map<string, { file: number; site: number; matched: number }>();
  const day = (d: string) => days.get(d) ?? days.set(d, { file: 0, site: 0, matched: 0 }).get(d)!;
  const fmt = (d: Date | null) => (d ? `${ymd(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null);
  let matched = 0;

  for (const p of filePeople.values()) {
    const found = [...((p.email && byEmail.get(p.email)) || []), ...((p.phone && byPhone.get(p.phone)) || [])];
    const contact = p.email || p.phone;
    if (p.at) day(ymd(p.at)).file++;
    if (!found.length) { onlyFile.push({ contact, at: fmt(p.at), tag: p.tag }); continue; }
    matched++;
    if (p.at) day(ymd(p.at)).matched++;
    found.forEach((l) => used.add(l));
    // the lead that says the most: one with a channel, then the earliest
    const lead = [...found].sort((a, b) => Number(!siteTag(a)) - Number(!siteTag(b)) || a.at.localeCompare(b.at))[0];
    const st = siteTag(lead);
    if (found.some((l) => sameTag(p.tag, l))) { if (p.tag) tags.same++; else tags.bothEmpty++; continue; }
    const kind = p.tag && !st ? "fileOnly" : !p.tag && st ? "siteOnly" : "different";
    tags[kind]++;
    tagDiffs.push({ contact, at: fmt(p.at), fileTag: p.tag, siteTag: st, kind: lead.kind });
    const k = `${p.tag}\u0000${st}`;
    const pair = pairs.get(k) ?? pairs.set(k, { fileTag: p.tag, siteTag: st, n: 0 }).get(k)!;
    pair.n++;
  }

  // site people: one per contact, leads within the file's period
  const sitePeople = new Map<string, SitePerson>();
  let outside = 0;
  const lo = from ? ymd(from) : null;
  const hi = to ? new Date(+to + AFTER_EXPORT_MS) : null;
  for (const l of leads) {
    const e = normEmail(l.email), p = normPhone(l.phone);
    const key = e || (p && `tel:${p}`);
    if (!key) continue;
    const at = parseDate(l.at);
    const inside = !at || ((!lo || ymd(at) >= lo) && (!hi || at <= hi));
    if (!inside) { if (!used.has(l)) outside++; continue; }
    if (!sitePeople.has(key)) {
      sitePeople.set(key, { contact: e || p, at: l.at, tag: siteTag(l), kind: l.kind });
      if (at) day(ymd(at)).site++;
    }
  }
  // a site person is matched when any of their leads was, by e-mail or by phone
  const matchedKeys = new Set<string>();
  for (const l of used) {
    const e = normEmail(l.email), p = normPhone(l.phone);
    if (e) matchedKeys.add(e);
    if (p) matchedKeys.add(`tel:${p}`);
  }
  const onlySite = [...sitePeople.entries()].filter(([k]) => !matchedKeys.has(k)).map(([, v]) => v);

  const count = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
  };

  return {
    file: { rows: fileRows, people: filePeople.size, repeats: fileRows - noContactFile - filePeople.size, noContact: noContactFile, from: fmt(from), to: fmt(to) },
    site: { leads: leads.length, people: sitePeople.size, noContact: noContactSite, outside, byKind },
    matched,
    onlyFile: onlyFile.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")),
    onlySite: onlySite.sort((a, b) => a.at.localeCompare(b.at)),
    tags,
    tagDiffs,
    onlyFileByTag: count(onlyFile.map((p) => p.tag)),
    onlySiteByTag: count(onlySite.map((p) => p.tag)),
    pairs: [...pairs.values()].sort((a, b) => b.n - a.n),
    byDay: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ day: d, ...v })),
  };
}
