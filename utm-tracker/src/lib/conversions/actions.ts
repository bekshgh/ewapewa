import type { Prisma, PrismaClient } from "@prisma/client";
import { computeRatios, validateInputs } from "./compute";
import { maskEmail, normalizeEmail, statusOf, type Decision } from "./quality";
import { activeInputs, INPUTS, type InputKey } from "./registry";
import { getQualitySettings, FLAGS, type Flag } from "./settings";
import { listTabs, parseSpreadsheetId, readTab, serviceAccountEmail, SheetError } from "./sheets";
import {
  AUTO_KEYS,
  MANUAL_KEYS,
  asManual,
  evaluateOgx,
  loadState,
  saveRegistration,
  type AutoKey,
  type ManualKey,
  type RegistrationMeta,
  type RegistrationSheet,
} from "./state";
import { ColumnError, guessColumns, parseCsv, parseXlsx, previewColumns, tableToRows, type ColumnMap } from "./tabular";

/**
 * Admin actions behind the conversion API. Every write is audited.
 * Callers check that the user is an admin before calling any of these.
 */

export class ActionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The single admin's identity (see /api/auth/login). */
export const actor = () => process.env.AUTH_EMAIL?.trim() || "admin";

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function audit(db: PrismaClient | Prisma.TransactionClient, projectId: string, action: string, detail: unknown, who: string) {
  await db.conversionAudit.create({ data: { projectId, action, detail: json(detail), actor: who } });
}

async function ensureProject(db: PrismaClient, projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!p) throw new ActionError(404, "Проект не найден");
}

/* ─── settings ──────────────────────────────────────────────────── */

export interface ConfigInput {
  registrationSheet?: RegistrationSheet | null;
  ogxCampaignId?: string | null;
  countSuspicious?: boolean;
}

export async function saveConfig(db: PrismaClient, projectId: string, input: ConfigInput, who = actor()) {
  await ensureProject(db, projectId);
  if (input.ogxCampaignId) {
    const c = await db.campaign.findUnique({ where: { id: input.ogxCampaignId }, select: { id: true } });
    if (!c) throw new ActionError(400, "Кампания не найдена");
  }
  const data: Prisma.ProjectConversionConfigUncheckedUpdateInput = {};
  if (input.registrationSheet !== undefined) {
    data.registrationSheet = input.registrationSheet === null ? (null as unknown as Prisma.InputJsonValue) : json(input.registrationSheet);
  }
  if (input.ogxCampaignId !== undefined) data.ogxCampaignId = input.ogxCampaignId;
  if (input.countSuspicious !== undefined) data.countSuspicious = input.countSuspicious;
  await db.projectConversionConfig.upsert({
    where: { projectId },
    create: { ...(data as Prisma.ProjectConversionConfigUncheckedCreateInput), projectId },
    update: data,
  });
  await audit(db, projectId, "config", input, who);
}

/* ─── manual values & overrides ─────────────────────────────────── */

export interface ManualInput {
  showUp?: number | null;
  aiesecOrgSignup?: number | null;
  asOf?: string | null;
  note?: string | null;
}

export async function saveManual(db: PrismaClient, projectId: string, input: ManualInput, who = actor()) {
  await ensureProject(db, projectId);
  const { errors } = validateInputs(input as Record<string, unknown>);
  const blocking = MANUAL_KEYS.filter((k) => errors[k]);
  if (blocking.length) throw new ActionError(400, blocking.map((k) => `${INPUTS[k].label}: ${errors[k]}`).join("; "));
  const cfg = await db.projectConversionConfig.findUnique({ where: { projectId } });
  const manual = asManual(cfg?.manual);
  const at = new Date().toISOString();
  for (const k of MANUAL_KEYS) {
    if (input[k] === undefined) continue;
    manual[k] = { value: input[k] ?? null, asOf: input.asOf ?? null, note: input.note?.trim() || null, by: who, at };
  }
  await db.projectConversionConfig.upsert({
    where: { projectId },
    create: { projectId, manual: json(manual) },
    update: { manual: json(manual) },
  });
  await audit(db, projectId, "manual", input, who);
}

/** Overriding an automatic value always needs a reason; `null` returns to the automatic value. */
export async function setOverride(
  db: PrismaClient,
  projectId: string,
  key: AutoKey,
  override: { value: number; reason: string } | null,
  who = actor(),
) {
  await ensureProject(db, projectId);
  if (!AUTO_KEYS.includes(key)) throw new ActionError(400, "Это поле вводится вручную, переопределять нечего");
  if (override) {
    const { errors } = validateInputs({ [key]: override.value });
    if (errors[key]) throw new ActionError(400, `${INPUTS[key].label}: ${errors[key]}`);
    if (!override.reason?.trim()) throw new ActionError(400, "Укажите причину переопределения");
  }
  const cfg = await db.projectConversionConfig.findUnique({ where: { projectId } });
  const manual = asManual(cfg?.manual);
  const overrides = { ...(manual.overrides ?? {}) };
  if (override) overrides[key] = { value: override.value, reason: override.reason.trim(), by: who, at: new Date().toISOString() };
  else delete overrides[key];
  manual.overrides = overrides;
  await db.projectConversionConfig.upsert({
    where: { projectId },
    create: { projectId, manual: json(manual) },
    update: { manual: json(manual) },
  });
  await audit(db, projectId, override ? "override" : "override_cleared", { key, ...override }, who);
}

/* ─── snapshots (append-only) ───────────────────────────────────── */

export async function createSnapshot(db: PrismaClient, projectId: string, input: { asOfDate?: string | null; note?: string | null }, who = actor()) {
  await ensureProject(db, projectId);
  const state = await loadState(db, projectId);
  const asOf = input.asOfDate ? new Date(`${input.asOfDate}T00:00:00Z`) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new ActionError(400, "Неверная дата");
  const sources = Object.fromEntries(
    activeInputs().map((d) => {
      const s = state.inputs[d.key];
      return [
        d.key,
        {
          mode: s.mode,
          origin: s.origin,
          autoValue: s.autoValue ?? null,
          raw: s.breakdown?.raw ?? null,
          duplicates: s.breakdown?.duplicates ?? null,
          invalid: s.breakdown?.invalid ?? null,
          quarantined: s.breakdown?.quarantined ?? null,
          pending: s.breakdown?.pending ?? null,
          strict: s.breakdown?.strict ?? null,
          overrideReason: s.override?.reason ?? null,
        },
      ];
    }),
  );
  const quality = {
    countSuspicious: state.config.countSuspicious,
    warnings: state.validation.warnings,
    registrationFetchedAt: state.config.registrationMeta?.fetchedAt ?? null,
  };
  const v = (k: InputKey) => state.inputs[k].value;
  const snap = await db.conversionSnapshot.create({
    data: {
      projectId,
      asOfDate: asOf,
      createdBy: who,
      note: input.note?.trim() || null,
      projectRegs: v("projectRegs"),
      showUp: v("showUp"),
      regOgx: v("regOgx"),
      aiesecOrgSignup: v("aiesecOrgSignup"),
      regMxp: null,
      sources: json(sources),
      quality: json(quality),
    },
  });
  await audit(db, projectId, "snapshot", { id: snap.id, asOfDate: asOf.toISOString() }, who);
  return snap;
}

/** History with ratios recomputed from the registry (a formula change needs no migration). */
export async function listSnapshots(db: PrismaClient, projectId: string) {
  const rows = await db.conversionSnapshot.findMany({ where: { projectId }, orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }] });
  return rows.map((s) => ({
    id: s.id,
    asOfDate: s.asOfDate.toISOString().slice(0, 10),
    createdAt: s.createdAt.toISOString(),
    createdBy: s.createdBy,
    note: s.note,
    inputs: { projectRegs: s.projectRegs, showUp: s.showUp, regOgx: s.regOgx, aiesecOrgSignup: s.aiesecOrgSignup },
    sources: s.sources,
    ratios: computeRatios({ projectRegs: s.projectRegs, showUp: s.showUp, regOgx: s.regOgx, aiesecOrgSignup: s.aiesecOrgSignup }).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.value,
      num: r.num,
      den: r.den,
    })),
  }));
}

/* ─── registration source ───────────────────────────────────────── */

const REFRESH_COOLDOWN_MS = 30_000;

export async function sheetPreview(link: string, tab: string | null, fetchImpl: typeof fetch = fetch) {
  const spreadsheetId = parseSpreadsheetId(link);
  if (!spreadsheetId) throw new ActionError(400, "Не похоже на ссылку Google-таблицы. Скопируйте адрес из браузера целиком.");
  try {
    const tabs = await listTabs(spreadsheetId, fetchImpl);
    const chosen = tab && tabs.includes(tab) ? tab : tabs[0];
    const table = chosen ? await readTab(spreadsheetId, chosen, fetchImpl) : [];
    return { spreadsheetId, tabs, tab: chosen ?? null, rows: Math.max(0, table.length - 1), columns: previewColumns(table), guess: guessColumns(table) };
  } catch (e) {
    if (e instanceof SheetError) throw new ActionError(e.code === "not_configured" ? 503 : 400, e.message);
    throw e;
  }
}

async function recordError(db: PrismaClient, projectId: string, message: string) {
  const cfg = await db.projectConversionConfig.findUnique({ where: { projectId } });
  const meta = (cfg?.registrationMeta as unknown as RegistrationMeta | null) ?? null;
  const next = { ...(meta ?? {}), error: message, errorAt: new Date().toISOString() };
  await db.projectConversionConfig.upsert({
    where: { projectId },
    create: { projectId, registrationMeta: json(next) },
    update: { registrationMeta: json(next) },
  });
}

export async function refreshFromSheet(db: PrismaClient, projectId: string, who = actor(), fetchImpl: typeof fetch = fetch) {
  await ensureProject(db, projectId);
  const cfg = await db.projectConversionConfig.findUnique({ where: { projectId } });
  const sheet = (cfg?.registrationSheet as unknown as RegistrationSheet | null) ?? null;
  if (!sheet?.spreadsheetId) throw new ActionError(400, "Сначала укажите таблицу регистраций в настройках");
  const meta = (cfg?.registrationMeta as unknown as RegistrationMeta | null) ?? null;
  if (meta?.fetchedAt && meta.origin === "sheet" && Date.now() - new Date(meta.fetchedAt).getTime() < REFRESH_COOLDOWN_MS) {
    return { meta, cached: true };
  }
  try {
    const table = await readTab(sheet.spreadsheetId, sheet.tab, fetchImpl);
    const rows = tableToRows(table, sheet);
    const saved = await saveRegistration(db, projectId, rows, { origin: "sheet", label: `лист «${sheet.tab}»` });
    await audit(db, projectId, "refresh_sheet", { raw: saved.raw }, who);
    return { meta: saved, cached: false };
  } catch (e) {
    if (e instanceof SheetError || e instanceof ColumnError) {
      await recordError(db, projectId, e.message);
      throw new ActionError(e instanceof SheetError && e.code === "not_configured" ? 503 : 400, e.message);
    }
    throw e;
  }
}

/** Uploaded CSV/XLSX: with `columns` it is processed; without, only previewed. */
export async function uploadRegistration(
  db: PrismaClient,
  projectId: string,
  file: { name: string; bytes: Buffer },
  columns: ColumnMap | null,
  tab: string | null,
  who = actor(),
) {
  await ensureProject(db, projectId);
  const lower = file.name.toLowerCase();
  let table: string[][];
  let tabs: string[] = [];
  if (lower.endsWith(".csv")) table = parseCsv(file.bytes.toString("utf8"));
  else if (lower.endsWith(".xlsx")) ({ table, tabs } = await parseXlsx(file.bytes, tab));
  else throw new ActionError(400, "Нужен файл .csv или .xlsx (Google Таблицы: Файл → Скачать)");
  if (!columns) return { preview: { tabs, rows: Math.max(0, table.length - 1), columns: previewColumns(table), guess: guessColumns(table) } };
  try {
    const rows = tableToRows(table, columns);
    const meta = await saveRegistration(db, projectId, rows, { origin: "upload", label: file.name });
    await audit(db, projectId, "upload", { file: file.name, raw: meta.raw }, who);
    return { meta };
  } catch (e) {
    if (e instanceof ColumnError) throw new ActionError(400, e.message);
    throw e;
  }
}

export const googleStatus = () => ({ serviceAccountEmail: serviceAccountEmail() });

/* ─── review queue ──────────────────────────────────────────────── */

export interface QueueItem {
  source: "sheet" | "ogx";
  key: string;
  /** Sheet: masked email + row number. oGX: the lead's name and email (admins only). */
  label: string;
  detail: string | null;
  ref: string | null;
  status: "valid" | "suspicious" | "quarantined";
  decision: Decision | null;
  flags: Flag[];
  riskScore: number;
  decidedBy: string | null;
  decidedAt: string | null;
}

export async function reviewQueue(db: PrismaClient, projectId: string): Promise<QueueItem[]> {
  const [cfg, settings] = await Promise.all([
    db.projectConversionConfig.findUnique({ where: { projectId }, include: { campaign: { select: { id: true, name: true } } } }),
    getQualitySettings(db),
  ]);
  const items: QueueItem[] = [];

  const sheetRows = await db.rowReview.findMany({ where: { projectId, source: "sheet", present: true }, orderBy: { riskScore: "desc" } });
  for (const r of sheetRows) {
    const status = statusOf(r.riskScore, settings);
    if (status === "valid" && !r.decision) continue;
    items.push({
      source: "sheet",
      key: r.rowKey,
      label: r.label ?? "—",
      detail: null,
      ref: r.rowRef,
      status,
      decision: (r.decision as Decision | null) ?? null,
      flags: r.flags as Flag[],
      riskScore: r.riskScore,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt?.toISOString() ?? null,
    });
  }

  if (cfg?.campaign) {
    const { people } = await evaluateOgx(db, projectId, cfg.campaign, settings, cfg.countSuspicious);
    const flagged = people.filter((p) => p.status !== "valid" || p.decision);
    const leads = await db.lead.findMany({ where: { id: { in: flagged.map((p) => p.ref) } }, select: { id: true, name: true, email: true } });
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const decided = await db.rowReview.findMany({ where: { projectId, source: "ogx", rowKey: { in: flagged.map((p) => p.key) } } });
    const decidedByKey = new Map(decided.map((d) => [d.rowKey, d]));
    for (const p of flagged.sort((a, b) => b.riskScore - a.riskScore)) {
      const l = leadById.get(p.ref);
      const email = normalizeEmail(l?.email);
      const d = decidedByKey.get(p.key);
      items.push({
        source: "ogx",
        key: p.key,
        label: l?.email ?? (email ? maskEmail(email) : "—"),
        detail: l?.name ?? null,
        ref: p.ref,
        status: p.status,
        decision: p.decision,
        flags: p.flags,
        riskScore: p.riskScore,
        decidedBy: d?.decidedBy ?? null,
        decidedAt: d?.decidedAt?.toISOString() ?? null,
      });
    }
  }
  return items;
}

/**
 * Approve / reject / undo, for given keys or for everyone in the queue with a flag.
 * Decisions are stored by (project, source, hash of the normalised email).
 */
export async function decide(
  db: PrismaClient,
  projectId: string,
  input: { source: "sheet" | "ogx"; keys?: string[]; flag?: Flag; decision: Decision | null },
  who = actor(),
) {
  await ensureProject(db, projectId);
  if (!["sheet", "ogx"].includes(input.source)) throw new ActionError(400, "Неизвестный источник");
  if (input.flag && !FLAGS.includes(input.flag)) throw new ActionError(400, "Неизвестная причина");
  const queue = (await reviewQueue(db, projectId)).filter((q) => q.source === input.source);
  const targets = input.flag ? queue.filter((q) => q.flags.includes(input.flag!)) : queue.filter((q) => input.keys?.includes(q.key));
  if (!targets.length) throw new ActionError(400, "Нечего менять: записи не найдены в очереди");
  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const t of targets) {
      const data = {
        decision: input.decision,
        decidedBy: input.decision ? who : null,
        decidedAt: input.decision ? now : null,
      };
      await tx.rowReview.upsert({
        where: { projectId_source_rowKey: { projectId, source: input.source, rowKey: t.key } },
        create: { projectId, source: input.source, rowKey: t.key, status: t.status, flags: t.flags, riskScore: t.riskScore, rowRef: input.source === "sheet" ? t.ref : null, ...data },
        update: data,
      });
    }
    await audit(tx, projectId, "decision", { source: input.source, decision: input.decision, count: targets.length, flag: input.flag ?? null }, who);
  });
  return { changed: targets.length };
}

export const isAutoKey = (k: string): k is AutoKey => (AUTO_KEYS as string[]).includes(k);
export const isManualKey = (k: string): k is ManualKey => (MANUAL_KEYS as string[]).includes(k);
