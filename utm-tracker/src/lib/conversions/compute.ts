import { INPUTS, SANITY_CHECKS, SMALL_BASE, activeInputs, activeRatios, type InputKey } from "./registry";

export type Inputs = Partial<Record<InputKey, number | null>>;

export interface RatioResult {
  key: string;
  label: string;
  numerator: InputKey;
  denominator: InputKey;
  num: number | null;
  den: number | null;
  /** Share (0.10 = 10%), or null when an input is missing or the denominator is 0. */
  value: number | null;
  status: "ok" | "missing_input";
  /** Labels of the inputs that are missing (or a zero denominator). */
  missing: string[];
  smallBase: boolean;
  /** Above 100%: shown as-is, flagged for the admin. */
  over100: boolean;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Ratios are computed on read from the registry, so a formula change needs no data migration. */
export function computeRatios(inputs: Inputs): RatioResult[] {
  return activeRatios().map((r) => {
    const num = isNum(inputs[r.numerator]) ? (inputs[r.numerator] as number) : null;
    const den = isNum(inputs[r.denominator]) ? (inputs[r.denominator] as number) : null;
    const missing: string[] = [];
    if (num === null) missing.push(INPUTS[r.numerator].label);
    if (den === null) missing.push(INPUTS[r.denominator].label);
    else if (den === 0) missing.push(`${INPUTS[r.denominator].label} = 0`);
    const value = missing.length ? null : num! / den!;
    return {
      key: r.key,
      label: r.label,
      numerator: r.numerator,
      denominator: r.denominator,
      num,
      den,
      value,
      status: value === null ? "missing_input" : "ok",
      missing,
      smallBase: den !== null && den > 0 && den < SMALL_BASE,
      over100: value !== null && value > 1,
    };
  });
}

export interface ValidationResult {
  /** Blocking: negative or non-integer values. */
  errors: Partial<Record<InputKey, string>>;
  /** Non-blocking logical warnings, per input. */
  warnings: Partial<Record<InputKey, string>>;
}

/** Accepts null/undefined (= not entered). */
export function validateInputs(inputs: Record<string, unknown>): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  const warnings: ValidationResult["warnings"] = {};
  for (const def of activeInputs()) {
    const v = inputs[def.key];
    if (v === null || v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) errors[def.key] = "Нужно число";
    else if (v < 0) errors[def.key] = "Не может быть отрицательным";
    else if (!Number.isInteger(v)) errors[def.key] = "Нужно целое число";
  }
  for (const [a, b] of SANITY_CHECKS) {
    const va = inputs[a];
    const vb = inputs[b];
    if (isNum(va) && isNum(vb) && !errors[a] && !errors[b] && va > vb) {
      warnings[a] = `${INPUTS[a].label} больше, чем ${INPUTS[b].label}: проверьте данные`;
    }
  }
  return { errors, warnings };
}

/** "10,0%" — one decimal, Russian decimal comma. */
export function formatShare(v: number | null): string {
  if (v === null) return "нет данных";
  return `${(v * 100).toFixed(1).replace(".", ",")}%`;
}

/** "60 / 600" */
export function formatFraction(num: number | null, den: number | null): string {
  const f = (n: number | null) => (n === null ? "—" : n.toLocaleString("ru-RU"));
  return `${f(num)} / ${f(den)}`;
}
