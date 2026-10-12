import crypto from "crypto";
import { AttributionStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readWorkbook, type Grid, type Workbook } from "@/lib/reports/xlsx";

/**
 * Imports registrations exported from a landing page (e.g. the Google Sheet a
 * Tilda form writes to) as leads, so campaigns whose form never reached the
 * tracker still show their real lead count.
 *
 * - The sheet is found by its headers: a date column plus at least one of
 *   name / email / phone. Russian and English header names are understood.
 * - click_id is read from its own column or from the page URL; when it matches
 *   a recorded click the lead is attributed exactly, otherwise by UTM
 *   (estimated), otherwise it stays unattributed.
 * - One lead per registration row. Re-importing the same sheet creates nothing
 *   new: each row has a stable dedupe key in its own "reg:" namespace, so it
 *   never merges into a lead recorded by the snippet or webhook.
 */

/** Sheet timestamps are local wall-clock time; Kazakhstan is UTC+5. */
export const DEFAULT_TZ_OFFSET_MINUTES = 5 * 60;

type Field =
  | "date" | "name" | "email" | "phone" | "city" | "page" | "clickId"
  | "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm";

const ALIASES: Record<Field, string[]> = {
  date: ["дата и время", "дата", "время", "date", "datetime", "date and time", "timestamp", "submitted at", "created at", "sent"],
  name: ["имя и фамилия", "имя", "фио", "name", "full name"],
  email: ["email", "e-mail", "почта", "электронная почта"],
  phone: ["телефон", "номер телефона", "phone", "tel"],
  city: ["город", "city"],
  page: ["страница", "page", "page url", "pageurl", "url"],
  clickId: ["click_id", "clickid"],
  utmSource: ["utm_source"],
  utmMedium: ["utm_medium"],
  utmCampaign: ["utm_campaign"],
  utmContent: ["utm_content"],
  utmTerm: ["utm_term"],
};

const UTM_PARAM: Record<"utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm", string> = {
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  utmContent: "utm_content",
  utmTerm: "utm_term",
};
const UTM_FIELDS = Object.keys(UTM_PARAM) as (keyof typeof UTM_PARAM)[];

export interface Registration {
  /** 1-based row in the sheet, for messages. */
  row: number;
  submittedAt: Date;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  pageUrl?: string;
  clickId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

export interface ParsedRegistrations {
  sheet: string;
  rows: Registration[];
  /** Data rows without a usable date or without any contact. */
  skipped: number;
}

export class RegistrationImportError extends Error {}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function headerMap(grid: Grid, row: number): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  for (let c = 1; c <= grid.maxCol; c++) {
    const v = grid.cells.get(`${row},${c}`)?.v;
    if (typeof v !== "string") continue;
    const h = norm(v);
    for (const f of Object.keys(ALIASES) as Field[]) {
      if (out[f] === undefined && ALIASES[f].includes(h)) out[f] = c;
    }
  }
  return out;
}

const usable = (m: Partial<Record<Field, number>>) =>
  m.date !== undefined && (m.email !== undefined || m.phone !== undefined || m.name !== undefined);

/** The header row of the first sheet that looks like a registrations list. */
export function findRegistrationSheet(wb: Workbook): { grid: Grid; headerRow: number; cols: Partial<Record<Field, number>> } {
  for (const grid of wb.grids) {
    for (let r = 1; r <= Math.min(grid.maxRow, 10); r++) {
      const cols = headerMap(grid, r);
      if (usable(cols)) return { grid, headerRow: r, cols };
    }
  }
  throw new RegistrationImportError(
    "No sheet with registrations found. It needs a header row with a date column (e.g. «Дата и время») and an email, phone or name column.",
  );
}

function text(v: unknown, max = 500): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, max) : undefined;
}

/** Excel serial or "dd.mm.yyyy[ hh:mm[:ss]]" / ISO text, read as local time at `tzOffsetMinutes`. */
export function toDate(v: unknown, date1904: boolean, tzOffsetMinutes: number): Date | null {
  let wallMs: number | null = null;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    wallMs = Math.round(((date1904 ? v + 1462 : v) - 25569) * 86_400_000);
  } else if (typeof v === "string") {
    const s = v.trim();
    const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
    const m = ru ?? iso;
    if (m) {
      const [y, mo, d] = ru ? [m[3], m[2], m[1]] : [m[1], m[2], m[3]];
      wallMs = Date.UTC(+y, +mo - 1, +d, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), +((m[7] ?? "0").padEnd(3, "0")));
    }
  }
  if (wallMs === null || Number.isNaN(wallMs)) return null;
  return new Date(wallMs - tzOffsetMinutes * 60_000);
}

function queryOf(url: string | undefined): URLSearchParams | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams;
  } catch {
    return null;
  }
}

export function parseRegistrations(wb: Workbook, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES): ParsedRegistrations {
  const { grid, headerRow, cols } = findRegistrationSheet(wb);
  const cell = (r: number, f: Field) => (cols[f] === undefined ? undefined : grid.cells.get(`${r},${cols[f]}`)?.v);

  const rows: Registration[] = [];
  let skipped = 0;
  for (let r = headerRow + 1; r <= grid.maxRow; r++) {
    const name = text(cell(r, "name"), 200);
    const email = text(cell(r, "email"), 200)?.toLowerCase();
    const phone = text(cell(r, "phone"), 50);
    const rawDate = cell(r, "date");
    if (rawDate === undefined && !name && !email && !phone) continue; // blank line
    const submittedAt = toDate(rawDate, wb.date1904, tzOffsetMinutes);
    if (!submittedAt || (!name && !email && !phone)) {
      skipped++;
      continue;
    }

    const pageUrl = text(cell(r, "page"), 2000);
    const q = queryOf(pageUrl);
    const reg: Registration = {
      row: r,
      submittedAt,
      name,
      email,
      phone,
      city: text(cell(r, "city"), 100),
      pageUrl,
      clickId: text(cell(r, "clickId"), 100) ?? text(q?.get("click_id"), 100),
    };
    for (const f of UTM_FIELDS) reg[f] = text(cell(r, f), 200) ?? text(q?.get(UTM_PARAM[f]), 200);
    rows.push(reg);
  }
  return { sheet: grid.name, rows, skipped };
}

export async function readRegistrationFile(buf: Buffer | Uint8Array, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  return parseRegistrations(await readWorkbook(buf, () => true), tzOffsetMinutes);
}

/** Stable per-registration key, separate from the snippet/webhook "ck:" and "id:" keys. */
export function registrationKey(r: Registration): string {
  const who = r.email || r.phone || r.name || "";
  return "reg:" + crypto.createHash("sha256").update(`${who}|${r.submittedAt.toISOString()}`).digest("hex").slice(0, 32);
}

function formNameOf(pageUrl: string | undefined): string {
  try {
    const u = new URL(pageUrl!);
    return `Registration (${u.host}${u.pathname.replace(/\/+$/, "")})`.slice(0, 200);
  } catch {
    return "Registration (import)";
  }
}

export interface SelectOptions {
  /** Keep only rows whose city column equals this (case-insensitive). */
  city?: string;
  /** One lead per person (email, else phone, else name), keeping the earliest row. */
  onePerPerson?: boolean;
}

const personOf = (r: Registration) => (r.email || r.phone || r.name || "").toLowerCase();

/** Applies the city filter and the one-per-person rule. */
export function selectRegistrations(rows: Registration[], opts: SelectOptions = {}) {
  const city = opts.city ? norm(opts.city) : null;
  const inCity = city ? rows.filter((r) => r.city && norm(r.city) === city) : rows;
  if (!opts.onePerPerson) return { rows: inCity, filteredOut: rows.length - inCity.length, duplicatesRemoved: 0 };
  const seen = new Set<string>();
  const unique = [...inCity]
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
    .filter((r) => {
      const who = personOf(r);
      if (seen.has(who)) return false;
      seen.add(who);
      return true;
    });
  return { rows: unique, filteredOut: rows.length - inCity.length, duplicatesRemoved: inCity.length - unique.length };
}

export interface RegistrationImportSummary {
  sheet: string;
  /** All registration rows in the sheet. */
  totalRows: number;
  /** Rows per value of the city column, for picking a filter. */
  cities: { city: string; rows: number }[];
  /** Rows left out by the city filter. */
  filteredOut: number;
  /** Repeat registrations of the same person dropped by the one-per-person rule. */
  duplicatesRemoved: number;
  /** Rows selected for import. */
  rows: number;
  skipped: number;
  dateFrom: string | null;
  dateTo: string | null;
  uniquePeople: number;
  exact: number;
  estimated: number;
  unknown: number;
  /** Rows whose click_id is not among this tracker's recorded clicks. */
  clickNotFound: number;
  alreadyImported: number;
  /** Leads created (import), or that would be created (check). */
  created: number;
  byCampaign: { campaign: string; leads: number }[];
}

type LinkUtm = { id: string; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null };

export async function importRegistrations(
  parsed: ParsedRegistrations,
  mode: "check" | "import",
  opts: SelectOptions = {},
): Promise<RegistrationImportSummary> {
  const selected = selectRegistrations(parsed.rows, opts);
  const { rows } = selected;
  const cityCount = new Map<string, number>();
  for (const r of parsed.rows) if (r.city) cityCount.set(r.city, (cityCount.get(r.city) ?? 0) + 1);

  const clickIds = Array.from(new Set(rows.map((r) => r.clickId).filter((x): x is string => !!x)));
  const keys = rows.map(registrationKey);
  const [clicks, links, existing] = await Promise.all([
    clickIds.length
      ? prisma.clickEvent.findMany({
          where: { clickId: { in: clickIds } },
          select: {
            id: true, clickId: true, trackingLinkId: true,
            trackingLink: { select: { id: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true } },
          },
        })
      : [],
    prisma.trackingLink.findMany({
      select: { id: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.lead.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true } }),
  ]);
  const clickById = new Map(clicks.map((c) => [c.clickId, c]));
  const done = new Set(existing.map((e) => e.dedupeKey));

  // Same rule as resolveAttribution's estimated step: the newest link whose
  // campaign / source / content match every one of those the row has.
  const linkByUtm = (r: Registration): LinkUtm | undefined => {
    const want = (["utmCampaign", "utmSource", "utmContent"] as const).filter((f) => r[f]);
    if (want.length === 0) return undefined;
    return links.find((l) => want.every((f) => l[f] === r[f]));
  };

  const summary: RegistrationImportSummary = {
    sheet: parsed.sheet,
    totalRows: parsed.rows.length,
    cities: Array.from(cityCount, ([city, n]) => ({ city, rows: n })).sort((a, b) => b.rows - a.rows),
    filteredOut: selected.filteredOut,
    duplicatesRemoved: selected.duplicatesRemoved,
    rows: rows.length,
    skipped: parsed.skipped,
    dateFrom: null,
    dateTo: null,
    uniquePeople: new Set(rows.map(personOf)).size,
    exact: 0,
    estimated: 0,
    unknown: 0,
    clickNotFound: 0,
    alreadyImported: 0,
    created: 0,
    byCampaign: [],
  };
  const times = rows.map((r) => r.submittedAt.getTime());
  if (times.length) {
    summary.dateFrom = new Date(Math.min(...times)).toISOString();
    summary.dateTo = new Date(Math.max(...times)).toISOString();
  }

  const perCampaign = new Map<string, number>();
  const data: Prisma.LeadCreateManyInput[] = [];
  rows.forEach((r, i) => {
    const key = keys[i];
    const click = r.clickId ? clickById.get(r.clickId) : undefined;
    if (r.clickId && !click) summary.clickNotFound++;

    let status: AttributionStatus;
    let link: LinkUtm | undefined;
    if (click) {
      status = AttributionStatus.exact;
      link = click.trackingLink;
    } else {
      link = linkByUtm(r);
      status = link ? AttributionStatus.estimated : AttributionStatus.unknown;
    }
    // UTM from the page, else from the link the visitor came through (as the snippet does).
    const utm = Object.fromEntries(UTM_FIELDS.map((f) => [f, r[f] ?? (click ? link?.[f] ?? undefined : undefined) ?? null])) as Record<
      (typeof UTM_FIELDS)[number],
      string | null
    >;

    if (done.has(key)) {
      summary.alreadyImported++;
      return;
    }
    done.add(key); // identical rows inside one sheet count once
    summary[status]++;
    const camp = utm.utmCampaign ?? "—";
    perCampaign.set(camp, (perCampaign.get(camp) ?? 0) + 1);

    data.push({
      trackingLinkId: link?.id ?? null,
      clickEventId: click?.id ?? null,
      clickId: r.clickId ?? null,
      name: r.name ?? null,
      phone: r.phone ?? null,
      email: r.email ?? null,
      formName: formNameOf(r.pageUrl),
      pageUrl: r.pageUrl ?? null,
      ...utm,
      submittedAt: r.submittedAt,
      sourcePayload: { _source: "registration-import", sheet: parsed.sheet, row: r.row },
      attributionStatus: status,
      dedupeKey: key,
    });
  });
  summary.byCampaign = Array.from(perCampaign, ([campaign, leads]) => ({ campaign, leads })).sort((a, b) => b.leads - a.leads);

  if (mode === "check") {
    summary.created = data.length;
    return summary;
  }
  for (let i = 0; i < data.length; i += 500) {
    const res = await prisma.lead.createMany({ data: data.slice(i, i + 500), skipDuplicates: true });
    summary.created += res.count;
  }
  return summary;
}
