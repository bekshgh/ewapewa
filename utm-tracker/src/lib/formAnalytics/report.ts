import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { FieldDef } from "@/lib/formAnalytics/ingest";

/**
 * Drop-off report for a registration form, in the spirit of Tally's form
 * analytics. Unit: a session (one visit; a new one after 30 minutes idle).
 *
 * - started   — touched any field, or pressed «Send» right away
 * - reached k — started and got at least as far as field k (touched k or a
 *               later field, or tried to send); conditional fields count only
 *               sessions that had the field shown when they last saw it
 * - left on k — ended without success and the last active field was k; a
 *               session has "ended" once the page reported leaving, or after
 *               30 minutes of silence
 */

export interface ReportFilter {
  formId: string;
  from?: Date;
  to?: Date;
  utmSource?: string;
  utmCampaign?: string;
  device?: string;
  lang?: string;
  city?: string;
  includeTest?: boolean;
}

/** The filtered sessions as a SQL fragment, reused by every query below. */
function sessionsCte(f: ReportFilter) {
  const w: Prisma.Sql[] = [Prisma.sql`s."formId" = ${f.formId}`];
  if (f.from) w.push(Prisma.sql`(s."startedAt" AT TIME ZONE 'UTC') >= ${f.from}`);
  if (f.to) w.push(Prisma.sql`(s."startedAt" AT TIME ZONE 'UTC') < ${f.to}`);
  if (!f.includeTest) w.push(Prisma.sql`NOT s."isTest"`);
  if (f.utmSource) w.push(f.utmSource === "(none)" ? Prisma.sql`s."utmSource" IS NULL` : Prisma.sql`s."utmSource" = ${f.utmSource}`);
  if (f.utmCampaign) w.push(f.utmCampaign === "(none)" ? Prisma.sql`s."utmCampaign" IS NULL` : Prisma.sql`s."utmCampaign" = ${f.utmCampaign}`);
  if (f.device) w.push(Prisma.sql`s.device = ${f.device}`);
  if (f.lang) w.push(Prisma.sql`s.lang = ${f.lang}`);
  if (f.city) w.push(f.city === "(none)" ? Prisma.sql`(s.answers->>'city') IS NULL` : Prisma.sql`s.answers->>'city' = ${f.city}`);
  // "gone" = silent for 30 minutes. The columns hold UTC without a time zone: compare them
  // "AT TIME ZONE 'UTC'" with moments from here, or the database's time zone setting shifts them.
  const idleSince = new Date(Date.now() - 30 * 60_000);
  return Prisma.sql`
    s AS (
      SELECT s.*, (s.outcome = 'abandoned' OR (s."lastSeenAt" AT TIME ZONE 'UTC') < ${idleSince}) AS ended
      FROM "AnalyticsSession" s WHERE ${Prisma.join(w, " AND ")}
    ),
    ev AS (SELECT e.* FROM "AnalyticsEvent" e JOIN s ON s.id = e."sessionId"),
    flags AS (
      SELECT s.id,
        bool_or(ev.type = 'page_view') AS viewed,
        bool_or(ev.type IN ('form_view','form_start','submit_attempt','submit_success')
                OR (ev."fieldId" IS NOT NULL AND ev.type IN ('field_focus','field_change','field_blur'))) AS reached_form,
        bool_or(ev.type IN ('form_start','submit_attempt','submit_success')
                OR (ev."fieldId" IS NOT NULL AND ev.type IN ('field_focus','field_change','field_blur'))) AS started,
        bool_or(ev.type IN ('submit_attempt','submit_success')) AS attempted,
        bool_or(ev.type = 'submit_success') OR bool_or(s.outcome = 'success') AS success
      FROM s LEFT JOIN ev ON ev."sessionId" = s.id GROUP BY s.id
    )`;
}

export interface Funnel {
  sessions: number;
  visitors: number;
  viewed: number;
  reachedForm: number;
  started: number;
  attempted: number;
  success: number;
  /** success ÷ sessions, % */
  conversion: number;
  /** success ÷ started, % */
  completion: number;
}

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const n = (v: unknown) => Number(v ?? 0);

export async function funnel(f: ReportFilter): Promise<Funnel> {
  const [r] = await prisma.$queryRaw<Record<string, bigint>[]>(Prisma.sql`
    WITH ${sessionsCte(f)}
    SELECT count(*) AS sessions, count(DISTINCT s."visitorId") AS visitors,
      count(*) FILTER (WHERE fl.viewed) AS viewed,
      count(*) FILTER (WHERE fl.reached_form) AS reached_form,
      count(*) FILTER (WHERE fl.started) AS started,
      count(*) FILTER (WHERE fl.attempted) AS attempted,
      count(*) FILTER (WHERE fl.success) AS success
    FROM s JOIN flags fl ON fl.id = s.id`);
  const x = {
    sessions: n(r.sessions), visitors: n(r.visitors), viewed: n(r.viewed), reachedForm: n(r.reached_form),
    started: n(r.started), attempted: n(r.attempted), success: n(r.success),
  };
  return { ...x, conversion: pct(x.success, x.sessions), completion: pct(x.success, x.started) };
}

export interface FieldRow {
  k: string;
  kind: FieldDef["kind"];
  conditional: boolean;
  /** conditional fields: sessions that had it shown */
  shown: number | null;
  reached: number;
  filled: number;
  leftHere: number;
  /** left here ÷ reached, % */
  dropOff: number;
  errors: number;
  /** sessions with an error ÷ reached, % */
  errorRate: number;
  avgMs: number | null;
  medianMs: number | null;
  /** extra visits to the field (focuses beyond the first), all sessions */
  refocus: number;
}

export async function formFields(formId: string): Promise<FieldDef[]> {
  const form = await prisma.analyticsForm.findUnique({ where: { id: formId } });
  return (form?.fields as FieldDef[] | undefined) ?? [];
}

export async function fieldTable(f: ReportFilter, fields?: FieldDef[]): Promise<FieldRow[]> {
  const defs = fields ?? (await formFields(f.formId));
  if (!defs.length) return [];
  const keys = defs.map((d) => d.k);
  const cond = defs.filter((d) => d.cond).map((d) => d.k);
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    WITH ${sessionsCte(f)},
    fl AS (SELECT * FROM unnest(${keys}::text[]) WITH ORDINALITY AS t(k, idx)),
    lastvis AS (
      SELECT DISTINCT ON (ev."sessionId", ev."fieldId") ev."sessionId", ev."fieldId", ev.type = 'field_shown' AS shown
      FROM ev WHERE ev.type IN ('field_shown','field_hidden') ORDER BY ev."sessionId", ev."fieldId", ev.ts DESC, ev.id DESC
    ),
    laststate AS (
      SELECT DISTINCT ON (ev."sessionId", ev."fieldId") ev."sessionId", ev."fieldId", (ev.meta->>'filled')::boolean AS filled
      FROM ev WHERE ev.type IN ('field_blur','field_change') AND ev.meta ? 'filled'
      ORDER BY ev."sessionId", ev."fieldId", ev.ts DESC, ev.id DESC
    ),
    lastattempt AS (
      SELECT DISTINCT ON (ev."sessionId") ev."sessionId", ev.meta->'filled' AS filled
      FROM ev WHERE ev.type = 'submit_attempt' ORDER BY ev."sessionId", ev.ts DESC, ev.id DESC
    ),
    touched AS (
      SELECT ev."sessionId", ev."fieldId",
        count(*) FILTER (WHERE ev.type = 'field_focus') AS focuses,
        sum((ev.meta->>'dur')::int) FILTER (WHERE ev.type = 'field_blur') AS dur,
        bool_or(ev.type = 'field_error') AS errored
      FROM ev WHERE ev."fieldId" IS NOT NULL AND ev.type IN ('field_focus','field_blur','field_change','field_error')
      GROUP BY 1, 2
    ),
    lastf AS (
      SELECT DISTINCT ON (ev."sessionId") ev."sessionId", ev."fieldId"
      FROM ev WHERE ev."fieldId" IS NOT NULL AND ev.type IN ('field_focus','field_change','field_blur')
      ORDER BY ev."sessionId", ev.ts DESC, ev.id DESC
    ),
    depth AS (
      SELECT ev."sessionId", max(fl.idx) AS max_idx FROM ev JOIN fl ON fl.k = ev."fieldId"
      WHERE ev.type IN ('field_focus','field_change','field_blur') GROUP BY 1
    ),
    per AS (
      SELECT fl.k, fl.idx, s.id,
        (fl.k = ANY(${cond}::text[])) AS is_cond,
        coalesce(lv.shown, false) AS shown,
        fx.started AND (fx.attempted OR coalesce(d.max_idx, 0) >= fl.idx OR t."sessionId" IS NOT NULL)
          AND (NOT (fl.k = ANY(${cond}::text[])) OR coalesce(lv.shown, false)) AS reached,
        coalesce(ls.filled, false) OR coalesce(la.filled ? fl.k, false) AS filled,
        (fx.started AND NOT fx.success AND s.ended AND coalesce(s."lastField", lf."fieldId") = fl.k) AS left_here,
        coalesce(t.errored, false) AS errored,
        t.dur, coalesce(t.focuses, 0) AS focuses
      FROM fl CROSS JOIN s
        JOIN flags fx ON fx.id = s.id
        LEFT JOIN lastvis lv ON lv."sessionId" = s.id AND lv."fieldId" = fl.k
        LEFT JOIN laststate ls ON ls."sessionId" = s.id AND ls."fieldId" = fl.k
        LEFT JOIN lastattempt la ON la."sessionId" = s.id
        LEFT JOIN touched t ON t."sessionId" = s.id AND t."fieldId" = fl.k
        LEFT JOIN lastf lf ON lf."sessionId" = s.id
        LEFT JOIN depth d ON d."sessionId" = s.id
    )
    SELECT k, idx, bool_or(is_cond) AS is_cond,
      count(*) FILTER (WHERE shown) AS shown,
      count(*) FILTER (WHERE reached) AS reached,
      count(*) FILTER (WHERE reached AND filled) AS filled,
      count(*) FILTER (WHERE left_here) AS left_here,
      count(*) FILTER (WHERE reached AND errored) AS errors,
      avg(dur) FILTER (WHERE dur > 0) AS avg_ms,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE dur > 0) AS median_ms,
      sum(greatest(focuses - 1, 0)) AS refocus
    FROM per GROUP BY k, idx ORDER BY idx`);
  const kind = new Map(defs.map((d) => [d.k, d.kind]));
  return rows.map((r) => {
    const reached = n(r.reached), left = n(r.left_here), errors = n(r.errors);
    return {
      k: String(r.k),
      kind: kind.get(String(r.k)) ?? "text",
      conditional: Boolean(r.is_cond),
      shown: r.is_cond ? n(r.shown) : null,
      reached,
      filled: n(r.filled),
      leftHere: left,
      dropOff: pct(left, reached),
      errors,
      errorRate: pct(errors, reached),
      avgMs: r.avg_ms == null ? null : Math.round(n(r.avg_ms)),
      medianMs: r.median_ms == null ? null : Math.round(n(r.median_ms)),
      refocus: n(r.refocus),
    };
  });
}

export interface LeaveSummary {
  /** ended without starting the form (with/without seeing it) */
  beforeFormSeen: number;
  sawFormNotStarted: number;
  /** started, then left without any field being active (e.g. pressed «Send» and left) */
  startedNoField: number;
}

export async function leaveSummary(f: ReportFilter): Promise<LeaveSummary> {
  const [r] = await prisma.$queryRaw<Record<string, bigint>[]>(Prisma.sql`
    WITH ${sessionsCte(f)},
    lastf AS (
      SELECT DISTINCT ON (ev."sessionId") ev."sessionId", ev."fieldId" FROM ev
      WHERE ev."fieldId" IS NOT NULL AND ev.type IN ('field_focus','field_change','field_blur') ORDER BY ev."sessionId", ev.ts DESC, ev.id DESC
    )
    SELECT
      count(*) FILTER (WHERE s.ended AND NOT fx.success AND NOT fx.reached_form) AS before_form,
      count(*) FILTER (WHERE s.ended AND NOT fx.success AND fx.reached_form AND NOT fx.started) AS saw_form,
      count(*) FILTER (WHERE s.ended AND NOT fx.success AND fx.started AND coalesce(s."lastField", lf."fieldId") IS NULL) AS started_no_field
    FROM s JOIN flags fx ON fx.id = s.id LEFT JOIN lastf lf ON lf."sessionId" = s.id`);
  return { beforeFormSeen: n(r.before_form), sawFormNotStarted: n(r.saw_form), startedNoField: n(r.started_no_field) };
}

/** Which required fields people most often left empty when they pressed «Send». */
export async function blockedReasons(f: ReportFilter): Promise<{ k: string; sessions: number; times: number }[]> {
  const rows = await prisma.$queryRaw<{ k: string; sessions: bigint; times: bigint }[]>(Prisma.sql`
    WITH ${sessionsCte(f)}
    SELECT m.k, count(DISTINCT ev."sessionId") AS sessions, count(*) AS times
    FROM ev CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(ev.meta->'missing', '[]'::jsonb)) AS m(k)
    WHERE ev.type = 'submit_blocked' GROUP BY m.k ORDER BY sessions DESC, times DESC`);
  return rows.map((r) => ({ k: r.k, sessions: n(r.sessions), times: n(r.times) }));
}

export type SliceBy = "source" | "campaign" | "device" | "lang" | "city" | "relocation" | "country";
const SLICE_SQL: Record<SliceBy, Prisma.Sql> = {
  source: Prisma.sql`s."utmSource"`,
  campaign: Prisma.sql`s."utmCampaign"`,
  device: Prisma.sql`s.device`,
  lang: Prisma.sql`s.lang`,
  city: Prisma.sql`s.answers->>'city'`,
  relocation: Prisma.sql`s.answers->>'relocation'`,
  country: Prisma.sql`s.country`,
};

export interface SliceRow { key: string; sessions: number; started: number; attempted: number; success: number; conversion: number; completion: number }

export async function slice(f: ReportFilter, by: SliceBy): Promise<SliceRow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    WITH ${sessionsCte(f)}
    SELECT coalesce(${SLICE_SQL[by]}, '(none)') AS key, count(*) AS sessions,
      count(*) FILTER (WHERE fx.started) AS started, count(*) FILTER (WHERE fx.attempted) AS attempted,
      count(*) FILTER (WHERE fx.success) AS success
    FROM s JOIN flags fx ON fx.id = s.id GROUP BY 1 ORDER BY sessions DESC, key LIMIT 50`);
  return rows.map((r) => {
    const x = { key: String(r.key), sessions: n(r.sessions), started: n(r.started), attempted: n(r.attempted), success: n(r.success) };
    return { ...x, conversion: pct(x.success, x.sessions), completion: pct(x.success, x.started) };
  });
}

export interface SessionRow {
  id: string; startedAt: Date; lastSeenAt: Date; outcome: string; lastField: string | null;
  utmSource: string | null; utmCampaign: string | null; device: string | null; lang: string | null; country: string | null;
  city: string | null; relocation: string | null; events: number; isTest: boolean; durationMs: number;
}

export async function sessions(f: ReportFilter, limit = 200): Promise<SessionRow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    WITH ${sessionsCte(f)},
    lastf AS (
      SELECT DISTINCT ON (ev."sessionId") ev."sessionId", ev."fieldId" FROM ev
      WHERE ev."fieldId" IS NOT NULL AND ev.type IN ('field_focus','field_change','field_blur') ORDER BY ev."sessionId", ev.ts DESC, ev.id DESC
    ),
    cnt AS (SELECT ev."sessionId", count(*) AS events FROM ev GROUP BY 1)
    SELECT s.id, s."startedAt", s."lastSeenAt",
      CASE WHEN fx.success THEN 'success' WHEN s.ended THEN 'abandoned' ELSE 'open' END AS outcome,
      coalesce(s."lastField", lf."fieldId") AS last_field, s."utmSource", s."utmCampaign", s.device, s.lang, s.country,
      s.answers->>'city' AS city, s.answers->>'relocation' AS relocation, coalesce(c.events, 0) AS events, s."isTest"
    FROM s JOIN flags fx ON fx.id = s.id LEFT JOIN lastf lf ON lf."sessionId" = s.id LEFT JOIN cnt c ON c."sessionId" = s.id
    ORDER BY s."startedAt" DESC LIMIT ${limit}`);
  return rows.map((r) => ({
    id: String(r.id), startedAt: r.startedAt as Date, lastSeenAt: r.lastSeenAt as Date, outcome: String(r.outcome),
    lastField: (r.last_field as string | null) ?? null, utmSource: (r.utmSource as string) ?? null, utmCampaign: (r.utmCampaign as string) ?? null,
    device: (r.device as string) ?? null, lang: (r.lang as string) ?? null, country: (r.country as string) ?? null,
    city: (r.city as string) ?? null, relocation: (r.relocation as string) ?? null, events: n(r.events), isTest: Boolean(r.isTest),
    durationMs: (r.lastSeenAt as Date).getTime() - (r.startedAt as Date).getTime(),
  }));
}

/** Values to offer in the filters. */
export async function filterOptions(formId: string) {
  const rows = await prisma.$queryRaw<{ dim: string; v: string | null }[]>(Prisma.sql`
    SELECT DISTINCT 'source' AS dim, "utmSource" AS v FROM "AnalyticsSession" WHERE "formId" = ${formId}
    UNION SELECT DISTINCT 'campaign', "utmCampaign" FROM "AnalyticsSession" WHERE "formId" = ${formId}
    UNION SELECT DISTINCT 'device', device FROM "AnalyticsSession" WHERE "formId" = ${formId}
    UNION SELECT DISTINCT 'lang', lang FROM "AnalyticsSession" WHERE "formId" = ${formId}
    UNION SELECT DISTINCT 'city', answers->>'city' FROM "AnalyticsSession" WHERE "formId" = ${formId}`);
  const out: Record<string, string[]> = { source: [], campaign: [], device: [], lang: [], city: [] };
  for (const r of rows) if (r.v) out[r.dim].push(r.v);
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

export async function report(f: ReportFilter) {
  const fields = await formFields(f.formId);
  const [fun, table, leave, blocked] = await Promise.all([funnel(f), fieldTable(f, fields), leaveSummary(f), blockedReasons(f)]);
  return { funnel: fun, fields: table, leave, blocked };
}
