import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Data-quality knobs for conversion sources. Defaults live here; an admin can
 * override any of them (AppSetting "conversions.quality") without a deploy.
 */
export const FLAGS = [
  "invalid_email_format",
  "disposable_email",
  "no_mx",
  "test_words",
  "gibberish_name_or_email",
  "placeholder_phone",
  "burst",
  "missing_utm",
  "possible_duplicate",
] as const;
export type Flag = (typeof FLAGS)[number];

export interface QualitySettings {
  /** Risk added per flag; the sum is capped at 100. */
  weights: Record<Flag, number>;
  /** riskScore < suspicious → valid; < quarantine → suspicious; else quarantined. */
  thresholds: { suspicious: number; quarantine: number };
  /** Drop dots and +tag in gmail.com / googlemail.com local parts. */
  gmailCanonical: boolean;
  /** Look up MX records (time-boxed, cached; a DNS failure never flags). */
  checkMx: boolean;
  mxTimeoutMs: number;
  /** This many records within `burstWindowMin` sharing an IP (or, without IPs, an email domain) are a burst. */
  burstMinRecords: number;
  burstWindowMin: number;
}

export const DEFAULT_QUALITY: QualitySettings = {
  weights: {
    invalid_email_format: 80,
    disposable_email: 60,
    test_words: 45,
    placeholder_phone: 35,
    gibberish_name_or_email: 30,
    no_mx: 30,
    burst: 25,
    possible_duplicate: 10,
    missing_utm: 5,
  },
  thresholds: { suspicious: 30, quarantine: 70 },
  gmailCanonical: true,
  checkMx: true,
  mxTimeoutMs: 1500,
  burstMinRecords: 5,
  burstWindowMin: 1,
};

export const QUALITY_KEY = "conversions.quality";

type Db = PrismaClient | Prisma.TransactionClient;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export async function getQualitySettings(db: Db): Promise<QualitySettings> {
  const row = await db.appSetting.findUnique({ where: { key: QUALITY_KEY } });
  const saved = (row?.value ?? {}) as Partial<QualitySettings>;
  const out: QualitySettings = structuredClone(DEFAULT_QUALITY);
  for (const f of FLAGS) if (isNum(saved.weights?.[f])) out.weights[f] = saved.weights![f];
  if (isNum(saved.thresholds?.suspicious)) out.thresholds.suspicious = saved.thresholds!.suspicious;
  if (isNum(saved.thresholds?.quarantine)) out.thresholds.quarantine = saved.thresholds!.quarantine;
  for (const k of ["gmailCanonical", "checkMx"] as const) if (typeof saved[k] === "boolean") out[k] = saved[k]!;
  for (const k of ["mxTimeoutMs", "burstMinRecords", "burstWindowMin"] as const) if (isNum(saved[k])) out[k] = saved[k]!;
  return out;
}
