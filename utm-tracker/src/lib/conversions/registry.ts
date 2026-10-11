/**
 * Declarative registry of conversion inputs and ratio types (EwA2ELD).
 * Labels are shown as-is in the (Russian) UI; names are never expanded.
 * Turning EwA2MXP on later = flip `enabled` and give `regMxp` a source.
 */

export const INPUT_KEYS = ["projectRegs", "regOgx", "showUp", "aiesecOrgSignup", "regMxp"] as const;
export type InputKey = (typeof INPUT_KEYS)[number];

export type SourceMode = "auto" | "manual";

export interface InputDef {
  key: InputKey;
  label: string;
  /** Where the value comes from when not overridden. */
  defaultMode: SourceMode;
  /** Shown and editable in the UI. */
  enabled: boolean;
}

export const INPUTS: Record<InputKey, InputDef> = {
  projectRegs: { key: "projectRegs", label: "Реги на проект", defaultMode: "auto", enabled: true },
  regOgx: { key: "regOgx", label: "Рега oGX", defaultMode: "auto", enabled: true },
  showUp: { key: "showUp", label: "Шоуап", defaultMode: "manual", enabled: true },
  aiesecOrgSignup: { key: "aiesecOrgSignup", label: "AIESEC.org signup", defaultMode: "manual", enabled: true },
  // EwA2MXP is paused: no source, no input.
  regMxp: { key: "regMxp", label: "Рега MXP", defaultMode: "manual", enabled: false },
};

export type RatioTypeKey = "ewa2ogx" | "ewa2mxp";

export interface RatioDef {
  key: string;
  type: RatioTypeKey;
  label: string;
  numerator: InputKey;
  denominator: InputKey;
  enabled: boolean;
}

export const RATIO_TYPES: { key: RatioTypeKey; label: string; enabled: boolean }[] = [
  { key: "ewa2ogx", label: "EwA2oGX", enabled: true },
  { key: "ewa2mxp", label: "EwA2MXP", enabled: false },
];

export const RATIOS: RatioDef[] = [
  { key: "ogx_per_regs", type: "ewa2ogx", label: "Рега oGX / Реги на проект", numerator: "regOgx", denominator: "projectRegs", enabled: true },
  { key: "ogx_per_showup", type: "ewa2ogx", label: "Рега oGX / Шоуап", numerator: "regOgx", denominator: "showUp", enabled: true },
  { key: "signup_per_regs", type: "ewa2ogx", label: "AIESEC.org signup / Реги на проект", numerator: "aiesecOrgSignup", denominator: "projectRegs", enabled: true },
  { key: "signup_per_showup", type: "ewa2ogx", label: "AIESEC.org signup / Шоуап", numerator: "aiesecOrgSignup", denominator: "showUp", enabled: true },
  { key: "signup_per_ogx", type: "ewa2ogx", label: "AIESEC.org signup / Рега oGX", numerator: "aiesecOrgSignup", denominator: "regOgx", enabled: true },
  { key: "mxp_per_regs", type: "ewa2mxp", label: "Рега MXP / Реги на проект", numerator: "regMxp", denominator: "projectRegs", enabled: false },
  { key: "mxp_per_showup", type: "ewa2mxp", label: "Рега MXP / Шоуап", numerator: "regMxp", denominator: "showUp", enabled: false },
];

/** Ratios of enabled types only: what the UI and API expose. */
export function activeRatios(): RatioDef[] {
  const on = new Set(RATIO_TYPES.filter((t) => t.enabled).map((t) => t.key));
  return RATIOS.filter((r) => r.enabled && on.has(r.type));
}

export function activeInputs(): InputDef[] {
  return INPUT_KEYS.map((k) => INPUTS[k]).filter((d) => d.enabled);
}

/** Below this denominator a ratio gets the "малая база" badge. */
export const SMALL_BASE = 20;

/** Logical checks: warn (never block) when the first exceeds the second. */
export const SANITY_CHECKS: [InputKey, InputKey][] = [
  ["regOgx", "projectRegs"],
  ["showUp", "projectRegs"],
  ["aiesecOrgSignup", "projectRegs"],
];
