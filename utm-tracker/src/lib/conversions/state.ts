import type { Prisma, PrismaClient } from "@prisma/client";
import { computeMetrics } from "@/lib/projects/metrics";
import type { ReportDocument } from "@/lib/reports/types";
import { computeRatios, validateInputs, type Inputs, type RatioResult, type ValidationResult } from "./compute";
import {
  countPeople,
  dnsMxLookup,
  processRows,
  statusOf,
  type Breakdown,
  type Decision,
  type Person,
  type SourceRow,
} from "./quality";
import { INPUTS, activeInputs, type InputKey, type SourceMode } from "./registry";
import { getQualitySettings, type Flag, type QualitySettings } from "./settings";
import type { ColumnMap } from "./tabular";

/**
 * Current conversion state of a project = live computation of the automatic
 * sources + the latest manual values. Server only.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type AutoKey = "projectRegs" | "regOgx";
export type ManualKey = "showUp" | "aiesecOrgSignup";
export const AUTO_KEYS: AutoKey[] = ["projectRegs", "regOgx"];
export const MANUAL_KEYS: ManualKey[] = ["showUp", "aiesecOrgSignup"];

export interface ManualValue {
  value: number | null;
  asOf?: string | null;
  note?: string | null;
  by: string;
  at: string;
}

export interface Override {
  value: number;
  reason: string;
  by: string;
  at: string;
}

export interface ManualState {
  showUp?: ManualValue;
  aiesecOrgSignup?: ManualValue;
  overrides?: Partial<Record<AutoKey, Override>>;
}

export interface RegistrationSheet extends ColumnMap {
  spreadsheetId: string;
  tab: string;
}

export interface RegistrationMeta {
  origin: "sheet" | "upload";
  label: string;
  fetchedAt: string;
  raw: number;
  invalid: number;
  duplicates: number;
  /** Last failed refresh; the previous good data stays in use. */
  error?: string | null;
  errorAt?: string | null;
}

export interface InputState {
  key: InputKey;
  label: string;
  value: number | null;
  mode: SourceMode;
  /** Human-readable origin: "из таблицы …", "с сайта (oGX-кампания …)", "ввёл админ". */
  origin: string;
  /** The automatic value, even when overridden. */
  autoValue?: number | null;
  breakdown?: Breakdown | null;
  override?: Override | null;
  manual?: ManualValue | null;
  /** Source caveat shown next to the number (fallback in use, refresh failed…). */
  note?: string | null;
}

export interface ConversionState {
  projectId: string;
  config: {
    registrationSheet: RegistrationSheet | null;
    ogxCampaign: { id: string; name: string; label: string | null } | null;
    countSuspicious: boolean;
    registrationMeta: RegistrationMeta | null;
  };
  inputs: Record<InputKey, InputState>;
  ratios: RatioResult[];
  validation: ValidationResult;
}

export const asManual = (v: unknown): ManualState => (v && typeof v === "object" ? (v as ManualState) : {});

/* ─── automatic sources ─────────────────────────────────────────── */

/** oGX leads of the project's campaign: by the link's campaign or by utm_campaign. */
export async function ogxRows(db: Db, campaign: { id: string; name: string }): Promise<SourceRow[]> {
  const leads = await db.lead.findMany({
    where: { OR: [{ trackingLink: { campaignId: campaign.id } }, { utmCampaign: campaign.name }] },
    select: { id: true, email: true, name: true, phone: true, submittedAt: true, utmCampaign: true, clickEvent: { select: { ipHash: true } } },
  });
  return leads.map((l) => ({
    email: l.email,
    name: l.name,
    phone: l.phone,
    at: l.submittedAt,
    ipHash: l.clickEvent?.ipHash ?? null,
    ref: l.id,
  }));
}

export interface EvaluatedPerson extends Person {
  status: ReturnType<typeof statusOf>;
  decision: Decision | null;
}

export async function evaluateOgx(
  db: Db,
  projectId: string,
  campaign: { id: string; name: string },
  settings: QualitySettings,
  countSuspicious: boolean,
): Promise<{ people: EvaluatedPerson[]; breakdown: Breakdown }> {
  const [rows, decisions] = await Promise.all([
    ogxRows(db, campaign),
    db.rowReview.findMany({ where: { projectId, source: "ogx", decision: { not: null } }, select: { rowKey: true, decision: true } }),
  ]);
  const processed = await processRows(rows, { settings, mx: settings.checkMx ? dnsMxLookup(settings.mxTimeoutMs) : null });
  const dec = new Map(decisions.map((d) => [d.rowKey, d.decision as Decision]));
  const people = processed.people.map((p) => ({ ...p, status: statusOf(p.riskScore, settings), decision: dec.get(p.key) ?? null }));
  return { people, breakdown: countPeople(people, processed, countSuspicious) };
}

/** Registration people as stored at the last refresh (hash, flags, score; no personal data). */
export async function evaluateRegistration(
  db: Db,
  projectId: string,
  meta: RegistrationMeta,
  settings: QualitySettings,
  countSuspicious: boolean,
): Promise<Breakdown> {
  const rows = await db.rowReview.findMany({
    where: { projectId, source: "sheet", present: true },
    select: { rowKey: true, riskScore: true, decision: true },
  });
  const people = rows.map((r) => ({ key: r.rowKey, status: statusOf(r.riskScore, settings), decision: (r.decision as Decision | null) ?? null }));
  return countPeople(people, meta, countSuspicious);
}

/** Store a processed registration table: one RowReview per person, decisions kept. */
export async function saveRegistration(
  db: PrismaClient,
  projectId: string,
  rows: SourceRow[],
  info: { origin: "sheet" | "upload"; label: string },
): Promise<RegistrationMeta> {
  const settings = await getQualitySettings(db);
  const processed = await processRows(rows, { settings, mx: settings.checkMx ? dnsMxLookup(settings.mxTimeoutMs) : null });
  const meta: RegistrationMeta = {
    origin: info.origin,
    label: info.label,
    fetchedAt: new Date().toISOString(),
    raw: processed.raw,
    invalid: processed.invalid,
    duplicates: processed.duplicates,
    error: null,
    errorAt: null,
  };
  await db.$transaction(async (tx) => {
    await tx.rowReview.updateMany({ where: { projectId, source: "sheet" }, data: { present: false } });
    for (const p of processed.people) {
      const data = {
        status: statusOf(p.riskScore, settings),
        flags: p.flags,
        riskScore: p.riskScore,
        present: true,
        label: p.label,
        rowRef: p.ref,
        seenAt: p.at,
      };
      await tx.rowReview.upsert({
        where: { projectId_source_rowKey: { projectId, source: "sheet", rowKey: p.key } },
        create: { projectId, source: "sheet", rowKey: p.key, ...data },
        update: data,
      });
    }
    await tx.projectConversionConfig.upsert({
      where: { projectId },
      create: { projectId, registrationMeta: meta as unknown as Prisma.InputJsonValue },
      update: { registrationMeta: meta as unknown as Prisma.InputJsonValue },
    });
  }, { timeout: 60_000 });
  return meta;
}

/** Fallback for projectRegs: unique registrants of the project's published Registration report. */
async function reportRegistrants(db: Db, projectId: string): Promise<{ value: number; title: string } | null> {
  const report = await db.report.findFirst({
    where: { projectId, type: "registration", status: "published" },
    orderBy: { updatedAt: "desc" },
    select: { title: true, data: true },
  });
  if (!report) return null;
  const value = computeMetrics({ registration: report.data as unknown as ReportDocument }).registrants;
  return value === null ? null : { value, title: report.title };
}

/* ─── state ─────────────────────────────────────────────────────── */

export async function loadState(db: Db, projectId: string): Promise<ConversionState> {
  const [cfg, settings] = await Promise.all([
    db.projectConversionConfig.findUnique({
      where: { projectId },
      include: { campaign: { select: { id: true, name: true, label: true } } },
    }),
    getQualitySettings(db),
  ]);
  const countSuspicious = cfg?.countSuspicious ?? true;
  const manual = asManual(cfg?.manual);
  const meta = (cfg?.registrationMeta as unknown as RegistrationMeta | null) ?? null;

  // projectRegs: processed table, else the published Registration report
  let regs: InputState = { key: "projectRegs", label: INPUTS.projectRegs.label, value: null, mode: "auto", origin: "нет источника" };
  if (meta?.fetchedAt) {
    const breakdown = await evaluateRegistration(db, projectId, meta, settings, countSuspicious);
    regs = {
      ...regs,
      value: breakdown.total,
      origin: meta.origin === "sheet" ? `из таблицы: ${meta.label}` : `из файла: ${meta.label}`,
      breakdown,
      note: meta.error ? `Последнее обновление не удалось: ${meta.error}. Показаны данные от ${new Date(meta.fetchedAt).toLocaleString("ru-RU")}.` : null,
    };
  } else {
    const fallback = await reportRegistrants(db, projectId);
    if (fallback) {
      regs = {
        ...regs,
        value: fallback.value,
        origin: `из отчёта Registration «${fallback.title}»`,
        note: "Запасной источник: таблица регистраций не подключена. Дубликаты убраны отчётом, проверки на фейки сайтом не было.",
      };
    } else if (meta?.error) {
      regs.note = meta.error;
    }
  }

  // regOgx: leads of the oGX campaign
  let ogx: InputState = { key: "regOgx", label: INPUTS.regOgx.label, value: null, mode: "auto", origin: "oGX-кампания не выбрана" };
  if (cfg?.campaign) {
    const { breakdown } = await evaluateOgx(db, projectId, cfg.campaign, settings, countSuspicious);
    ogx = { ...ogx, value: breakdown.total, origin: `с сайта: заявки oGX-кампании «${cfg.campaign.label || cfg.campaign.name}»`, breakdown };
  }

  const inputs = {} as Record<InputKey, InputState>;
  for (const auto of [regs, ogx]) {
    const o = manual.overrides?.[auto.key as AutoKey];
    inputs[auto.key] = o
      ? { ...auto, autoValue: auto.value, value: o.value, mode: "manual", override: o, origin: `переопределено вручную (авто: ${auto.value ?? "нет данных"})` }
      : { ...auto, autoValue: auto.value, override: null };
  }
  for (const key of MANUAL_KEYS) {
    const m = manual[key] ?? null;
    inputs[key] = {
      key,
      label: INPUTS[key].label,
      value: m?.value ?? null,
      mode: "manual",
      origin: m ? `ввёл админ${m.asOf ? `, по состоянию на ${m.asOf}` : ""}` : "не введено",
      manual: m,
    };
  }
  inputs.regMxp = { key: "regMxp", label: INPUTS.regMxp.label, value: null, mode: "manual", origin: "MXP приостановлен" };

  const values: Inputs = Object.fromEntries(activeInputs().map((d) => [d.key, inputs[d.key].value]));
  return {
    projectId,
    config: {
      registrationSheet: (cfg?.registrationSheet as unknown as RegistrationSheet | null) ?? null,
      ogxCampaign: cfg?.campaign ?? null,
      countSuspicious,
      registrationMeta: meta,
    },
    inputs,
    ratios: computeRatios(values),
    validation: validateInputs(values),
  };
}

/** Aggregates only: what a non-admin may ever see (no rows, emails or phones). */
export function publicView(state: ConversionState) {
  return {
    ratios: state.ratios,
    inputs: Object.fromEntries(
      activeInputs().map((d) => [d.key, { label: state.inputs[d.key].label, value: state.inputs[d.key].value, mode: state.inputs[d.key].mode }]),
    ),
  };
}

export type { Flag };
