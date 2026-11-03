import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TIME_ZONE } from "@/lib/utils";
import { allProjectGroups } from "@/lib/projectStats";
import { canEditFolder, type Actor } from "@/lib/permissions";
import { detectColumns, type Field, type RegistrationRow } from "./forecastCore";

/**
 * Data source A of the attendance forecast: the registrations the site already holds for a
 * project folder (leads of its own campaign, as on the folder page). The form's answers come
 * from the lead's raw payload: a Tilda webhook body holds every field of the form; a sheet
 * imported in Data keeps them under `answers` (see registrationImport.ts).
 */

/** Off only when ATTENDANCE_FORECAST_BETA is 0 / false / off. */
export const forecastBetaEnabled = () => !/^(0|false|off|no)$/i.test((process.env.ATTENDANCE_FORECAST_BETA ?? "").trim());

/** Admins and project managers (organisers); the site's data only for their own folders. */
export const canUseForecast = (a: Actor | null) => !!a && a.status === "active" && (a.role === "admin" || a.role === "manager");
export const canForecastFolder = (a: Actor | null, key: string) => canUseForecast(a) && canEditFolder(a, key);

/** Answer fields the model reads; contacts come from the lead's own columns. */
export const ANSWER_FIELDS = ["participationType", "university", "yearOfStudy", "teamName", "position", "major", "zimranInterest", "previousAiesecProject", "segment", "telegram"] as const;
export type AnswerField = (typeof ANSWER_FIELDS)[number];

/** Tilda's own keys, contacts and tags: never a form answer. */
const TECHNICAL = /^(utm_|tilda|form|tranid|cookies|click_?id|page|submitted|secret|test$|name$|email$|phone$|_)/i;

/** Form answers of one lead, keyed by forecast field. */
export function answersOf(payload: Prisma.JsonValue, cache = new Map<string, Partial<Record<Field, string>>>()): Partial<Record<AnswerField, string>> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const p = payload as Record<string, unknown>;
  const out: Partial<Record<AnswerField, string>> = {};
  const put = (f: AnswerField, v: unknown) => {
    if (v === null || v === undefined || typeof v === "object") return;
    const s = String(v).trim();
    if (s) out[f] = s.slice(0, 300);
  };
  if (p.answers && typeof p.answers === "object" && !Array.isArray(p.answers)) {
    const a = p.answers as Record<string, unknown>;
    for (const f of ANSWER_FIELDS) put(f, a[f]);
    return out;
  }
  const keys = Object.keys(p).filter((k) => !TECHNICAL.test(k));
  const sig = keys.join("\u0000");
  let map = cache.get(sig);
  if (!map) { map = detectColumns(keys); cache.set(sig, map); }
  for (const f of ANSWER_FIELDS) if (map[f]) put(f, p[map[f]!]);
  return out;
}

const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** The Almaty wall-clock time of an instant, as a local Date (what forecastCore expects). */
export function wallClock(d: Date): Date {
  const v = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
  return new Date(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute);
}

export interface FolderRegistrations {
  rows: RegistrationRow[];
  /** How many registrations carry each answer. */
  filled: Record<AnswerField, number>;
}

/** Which leads belong to a project folder: its own campaign's, by their utm_campaign or else their link's (as on the folder page). null: no such folder. */
export async function folderLeadWhere(key: string): Promise<Prisma.LeadWhereInput | null> {
  const group = (await allProjectGroups()).find((g) => g.key === key);
  if (!group) return null;
  const own = group.campaigns.filter((c) => c.role.kind === "project");
  if (!own.length) return { id: { in: [] } };
  const names = own.map((c) => c.name);
  const links = await prisma.trackingLink.findMany({
    where: { OR: [{ utmCampaign: { in: names } }, { campaignId: { in: own.map((c) => c.id) } }] },
    select: { id: true },
  });
  return { OR: [{ utmCampaign: { in: names } }, { utmCampaign: null, trackingLinkId: { in: links.map((l) => l.id) } }] };
}

export async function folderRegistrations(key: string): Promise<FolderRegistrations | null> {
  const where = await folderLeadWhere(key);
  if (!where) return null;
  const filled = Object.fromEntries(ANSWER_FIELDS.map((f) => [f, 0])) as Record<AnswerField, number>;
  const leads = await prisma.lead.findMany({
    where,
    select: { name: true, email: true, phone: true, submittedAt: true, sourcePayload: true },
    orderBy: { submittedAt: "asc" },
  });
  const cache = new Map<string, Partial<Record<Field, string>>>();
  const rows = leads.map((l): RegistrationRow => {
    const a = answersOf(l.sourcePayload, cache);
    for (const f of ANSWER_FIELDS) if (a[f]) filled[f]++;
    return { createdAt: wallClock(l.submittedAt), email: l.email, name: l.name, phone: l.phone, ...a };
  });
  return { rows, filled };
}

/* ------------------------------------------------ per-folder settings */

export const forecastSettingsSchema = z.object({
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  target: z.number().int().min(1).max(100_000).optional(),
});
export type ForecastSettings = z.infer<typeof forecastSettingsSchema>;

const settingsKey = (folder: string) => `project.forecast:${folder}`;

/** The folder's registration deadline and target, as the team set them on the forecast page. */
export async function forecastSettings(folders: string[]): Promise<Record<string, ForecastSettings>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: folders.map(settingsKey) } } });
  const out: Record<string, ForecastSettings> = {};
  for (const r of rows) {
    const parsed = forecastSettingsSchema.safeParse(r.value);
    if (parsed.success) out[r.key.slice(settingsKey("").length)] = parsed.data;
  }
  return out;
}

export async function saveForecastSettings(folder: string, value: ForecastSettings) {
  const json = value as Prisma.InputJsonValue;
  await prisma.appSetting.upsert({ where: { key: settingsKey(folder) }, create: { key: settingsKey(folder), value: json }, update: { value: json } });
}
