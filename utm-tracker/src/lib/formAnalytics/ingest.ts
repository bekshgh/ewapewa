import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * Ingests a batch of form-analytics events from the landing script
 * (POST /api/collect). Anonymous by construction: meta is cut down to a
 * per-type allowlist, and an answer value is kept only for category fields
 * (select / checkbox), never for text fields.
 */

export const EVENT_TYPES = [
  "page_view", "section_view", "cta_click", "lang_switch", "faq_open",
  "form_view", "form_start", "field_focus", "field_blur", "field_change", "field_shown", "field_hidden",
  "field_error", "submit_attempt", "submit_blocked", "submit_success", "submit_error",
  "modal_open", "tg_join_click", "abandon", "form_closed_view",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Field names that hold personal text: their values are dropped even if a page sends them. */
const TEXT_FIELDS = new Set(["name", "fullname", "email", "phone", "tel", "telegram", "age", "username", "comment"]);

const id = z.string().regex(/^[a-z0-9]{8,40}$/i);
const slug = z.string().max(80).regex(/^[A-Za-z0-9_.:-]+$/);
const fieldKey = z.string().max(40).regex(/^[A-Za-z0-9_]+$/);
const short = z.string().trim().max(200);

const fieldDef = z.object({ k: fieldKey, kind: z.enum(["text", "select", "check"]), cond: z.boolean().optional(), req: z.boolean().optional() });
export type FieldDef = z.infer<typeof fieldDef>;

const ctxSchema = z
  .object({
    utm_source: short, utm_medium: short, utm_campaign: short, utm_content: short, utm_term: short,
    click_id: z.string().max(100),
    referrer: z.string().max(500), url: z.string().max(500),
    device: z.enum(["mobile", "tablet", "desktop"]),
    screen: z.number().int().min(0).max(20000),
    lang: z.string().max(8),
    fields: z.array(fieldDef).max(60),
  })
  .partial();

const eventSchema = z.object({
  id: z.string().max(90),
  t: z.enum(EVENT_TYPES),
  ts: z.number().int(),
  o: z.number().int().min(0).max(7 * 86_400_000),
  f: fieldKey.nullish(),
  m: z.record(z.string(), z.unknown()).optional(),
  r: z.number().optional(),
});

export const batchSchema = z
  .object({
    v: z.literal(1),
    sid: id,
    vid: id,
    form: slug,
    project: slug.nullish(),
    test: z.boolean().optional(),
    ctx: ctxSchema.optional(),
    events: z.array(eventSchema).min(1).max(50),
  })
  .refine((b) => b.events.every((e) => e.id.startsWith(b.sid + ".")), { message: "event ids must belong to the session" });
export type Batch = z.infer<typeof batchSchema>;

const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const int = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(Math.round(v), max)) : undefined);
const token = (v: unknown, max = 40) => (typeof v === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(v) ? v.slice(0, max) : undefined);
const keys = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^[A-Za-z0-9_]{1,40}$/.test(x)).slice(0, 60) : undefined);
const clean = (o: Record<string, unknown>) => {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return Object.keys(out).length ? out : undefined;
};

/** A category answer, or nothing: values of text fields never pass. */
export function categoryValue(field: string | null | undefined, kind: FieldDef["kind"] | undefined, v: unknown): string | undefined {
  if (!field || TEXT_FIELDS.has(field.toLowerCase()) || kind === "text" || kind === undefined) return undefined;
  if (typeof v !== "string" || !/^[a-z0-9_.-]{1,40}$/i.test(v)) return undefined;
  if (v.includes("@") || /\d{5,}/.test(v)) return undefined; // looks like an e-mail or a phone, not a category
  return v;
}

/** Keeps only the meta keys each event type is allowed to carry. */
export function sanitizeMeta(type: EventType, field: string | null | undefined, m: Record<string, unknown> | undefined, kindOf: (k: string) => FieldDef["kind"] | undefined) {
  const x = m ?? {};
  switch (type) {
    case "page_view": return clean({ path: typeof x.path === "string" ? x.path.slice(0, 200) : undefined });
    case "section_view": return clean({ s: token(x.s) });
    case "cta_click": return clean({ from: token(x.from) });
    case "lang_switch": return clean({ from: token(x.from, 8), to: token(x.to, 8) });
    case "faq_open": return clean({ q: token(x.q) });
    case "field_focus": return clean({ n: int(x.n, 1000) });
    case "field_blur": return clean({ filled: bool(x.filled), valid: bool(x.valid), dur: int(x.dur, 3_600_000), len: int(x.len, 5000) });
    case "field_change": return clean({ value: categoryValue(field, field ? kindOf(field) : undefined, x.value), filled: bool(x.filled) });
    case "field_error": return clean({ error: token(x.error), on: token(x.on) });
    case "submit_attempt": return clean({ filled: keys(x.filled) });
    case "submit_blocked": return clean({ missing: keys(x.missing) });
    case "submit_success": case "modal_open": case "tg_join_click": return clean({ city: token(x.city) });
    case "submit_error": return clean({ error: typeof x.error === "string" ? x.error.replace(/\S+@\S+/g, "…").slice(0, 120) : undefined });
    case "abandon": return clean({ filled: keys(x.filled), elapsed: int(x.elapsed, 7 * 86_400_000), started: bool(x.started) });
    default: return undefined;
  }
}

/** sha256(ip + salt + day): changes every day, so visitors can't be followed across days by IP. */
export function hashIpDaily(ip: string | null, day = new Date().toISOString().slice(0, 10)): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(`${ip}|${process.env.IP_HASH_SALT ?? ""}|${day}`).digest("hex").slice(0, 32);
}

const CLAMP_PAST = 2 * 86_400_000;
const CLAMP_FUTURE = 5 * 60_000;

export interface IngestResult {
  stored: number;
  duplicates: number;
}

export async function ingest(batch: Batch, net: { ipHash: string | null; country: string | null }, now = Date.now()): Promise<IngestResult> {
  const ctx = batch.ctx ?? {};

  // The form and its field order (the page reports them with every batch; the latest wins).
  const existingForm = await prisma.analyticsForm.findUnique({ where: { id: batch.form } });
  let fields = (existingForm?.fields as FieldDef[] | undefined) ?? [];
  const fieldsChanged = !!ctx.fields?.length && JSON.stringify(ctx.fields) !== JSON.stringify(fields);
  if (fieldsChanged) fields = ctx.fields!;
  if (!existingForm || fieldsChanged || (batch.project && batch.project !== existingForm.projectSlug)) {
    await prisma.analyticsForm.upsert({
      where: { id: batch.form },
      create: { id: batch.form, projectSlug: batch.project ?? null, fields: fields as unknown as Prisma.InputJsonValue },
      update: { fields: fields as unknown as Prisma.InputJsonValue, ...(batch.project ? { projectSlug: batch.project } : {}) },
    });
  }
  const kinds = new Map(fields.map((f) => [f.k, f.kind]));
  const kindOf = (k: string) => kinds.get(k);

  const events = batch.events
    .map((e) => ({
      id: e.id,
      sessionId: batch.sid,
      type: e.t,
      fieldId: e.f ?? null,
      ts: new Date(Math.max(now - CLAMP_PAST, Math.min(e.ts, now + CLAMP_FUTURE))),
      offsetMs: e.o,
      meta: sanitizeMeta(e.t, e.f, e.m, kindOf) as Prisma.InputJsonValue | undefined,
    }))
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const first = events[0].ts, last = events[events.length - 1].ts;

  // Latest category answers, the outcome and the field the visitor left on.
  const answers: Record<string, string> = {};
  let success = false, abandoned = false, lastField: string | null | undefined;
  for (const e of events) {
    const meta = (e.meta ?? {}) as Record<string, unknown>;
    if (e.type === "field_change" && e.fieldId && typeof meta.value === "string") answers[e.fieldId] = meta.value;
    if (e.type === "submit_success") success = true;
    if (e.type === "abandon") { abandoned = true; if (e.fieldId) lastField = e.fieldId; }
    if ((e.type === "field_focus" || e.type === "field_change") && e.fieldId) lastField = e.fieldId;
  }

  const session = await prisma.analyticsSession.findUnique({ where: { id: batch.sid } });
  if (session && session.formId !== batch.form) throw new IngestError("session belongs to another form");
  let created = false;
  if (!session) {
    try {
      await prisma.analyticsSession.create({
        data: {
          id: batch.sid,
          visitorId: batch.vid,
          formId: batch.form,
          projectSlug: batch.project ?? null,
          utmSource: ctx.utm_source || null,
          utmMedium: ctx.utm_medium || null,
          utmCampaign: ctx.utm_campaign || null,
          utmContent: ctx.utm_content || null,
          utmTerm: ctx.utm_term || null,
          clickId: ctx.click_id || null,
          referrer: ctx.referrer || null,
          landingUrl: ctx.url || null,
          device: ctx.device ?? null,
          screenW: ctx.screen ?? null,
          lang: ctx.lang || null,
          country: net.country,
          ipHash: net.ipHash,
          answers: Object.keys(answers).length ? answers : undefined,
          startedAt: first,
          lastSeenAt: last,
          outcome: success ? "success" : abandoned ? "abandoned" : "open",
          lastField: lastField ?? null,
          isTest: batch.test === true,
        },
      });
      created = true;
    } catch (err) {
      // two batches of a new session at once: the other one created it
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  if (!created) {
    const cur = session ?? (await prisma.analyticsSession.findUniqueOrThrow({ where: { id: batch.sid } }));
    const data: Prisma.AnalyticsSessionUpdateInput = {};
    if (last > cur.lastSeenAt) data.lastSeenAt = last;
    if (first < cur.startedAt) data.startedAt = first;
    if (cur.outcome !== "success" && success) data.outcome = "success";
    else if (cur.outcome === "open" && abandoned) data.outcome = "abandoned";
    if (lastField !== undefined && last >= cur.lastSeenAt) data.lastField = lastField;
    if (Object.keys(answers).length) data.answers = { ...((cur.answers as Record<string, string> | null) ?? {}), ...answers };
    if (Object.keys(data).length) await prisma.analyticsSession.update({ where: { id: batch.sid }, data });
  }

  const res = await prisma.analyticsEvent.createMany({ data: events, skipDuplicates: true });
  return { stored: res.count, duplicates: events.length - res.count };
}

export class IngestError extends Error {}
