import { describe, expect, it } from "vitest";
import { computeRatios, formatFraction, formatShare, validateInputs } from "@/lib/conversions/compute";
import { RATIOS, RATIO_TYPES, activeInputs, activeRatios } from "@/lib/conversions/registry";

// Synthetic numbers from the spec: not tied to any real project.
const SYNTH = { projectRegs: 600, showUp: 300, regOgx: 60, aiesecOrgSignup: 30 };

const byKey = (inputs: Parameters<typeof computeRatios>[0]) =>
  Object.fromEntries(computeRatios(inputs).map((r) => [r.key, r]));

describe("registry", () => {
  it("EwA2oGX has the five ratios, built from the registry", () => {
    expect(activeRatios().map((r) => [r.label, r.numerator, r.denominator])).toEqual([
      ["Рега oGX / Реги на проект", "regOgx", "projectRegs"],
      ["Рега oGX / Шоуап", "regOgx", "showUp"],
      ["AIESEC.org signup / Реги на проект", "aiesecOrgSignup", "projectRegs"],
      ["AIESEC.org signup / Шоуап", "aiesecOrgSignup", "showUp"],
      ["AIESEC.org signup / Рега oGX", "aiesecOrgSignup", "regOgx"],
    ]);
  });

  it("EwA2MXP is registered but disabled and never exposed", () => {
    expect(RATIO_TYPES.find((t) => t.key === "ewa2mxp")).toMatchObject({ label: "EwA2MXP", enabled: false });
    expect(RATIOS.filter((r) => r.type === "ewa2mxp").map((r) => r.label)).toEqual(["Рега MXP / Реги на проект", "Рега MXP / Шоуап"]);
    expect(activeRatios().some((r) => r.type === "ewa2mxp")).toBe(false);
    expect(computeRatios({ ...SYNTH, regMxp: 10 }).some((r) => r.numerator === "regMxp")).toBe(false);
    expect(activeInputs().map((i) => i.key)).not.toContain("regMxp");
  });
});

describe("computeRatios", () => {
  it("matches the acceptance table", () => {
    const shown = computeRatios(SYNTH).map((r) => [r.label, formatShare(r.value), formatFraction(r.num, r.den)]);
    expect(shown).toEqual([
      ["Рега oGX / Реги на проект", "10,0%", "60 / 600"],
      ["Рега oGX / Шоуап", "20,0%", "60 / 300"],
      ["AIESEC.org signup / Реги на проект", "5,0%", "30 / 600"],
      ["AIESEC.org signup / Шоуап", "10,0%", "30 / 300"],
      ["AIESEC.org signup / Рега oGX", "50,0%", "30 / 60"],
    ]);
    expect(byKey(SYNTH).ogx_per_regs.value).toBeCloseTo(0.1);
  });

  it("missing showUp nulls only the ratios that use it", () => {
    const r = byKey({ ...SYNTH, showUp: null });
    expect(r.ogx_per_showup).toMatchObject({ value: null, status: "missing_input", missing: ["Шоуап"] });
    expect(r.signup_per_showup.value).toBeNull();
    expect(r.ogx_per_regs.value).toBeCloseTo(0.1);
    expect(r.signup_per_ogx.value).toBeCloseTo(0.5);
  });

  it("a zero denominator gives null, never Infinity or NaN", () => {
    const all = computeRatios({ ...SYNTH, projectRegs: 0 });
    for (const r of all) expect(r.value === null || Number.isFinite(r.value)).toBe(true);
    expect(byKey({ ...SYNTH, projectRegs: 0 }).ogx_per_regs).toMatchObject({ value: null, status: "missing_input", missing: ["Реги на проект = 0"] });
    expect(byKey({ ...SYNTH, regOgx: 0 }).signup_per_ogx.value).toBeNull();
    // 0 in the numerator is a real 0%
    expect(byKey({ ...SYNTH, regOgx: 0 }).ogx_per_regs.value).toBe(0);
  });

  it("values above 100% are kept and flagged", () => {
    const r = byKey({ ...SYNTH, aiesecOrgSignup: 90 });
    expect(r.signup_per_ogx.value).toBeCloseTo(1.5);
    expect(r.signup_per_ogx.over100).toBe(true);
    expect(formatShare(r.signup_per_ogx.value)).toBe("150,0%");
  });

  it("a denominator below 20 is a small base", () => {
    const r = byKey({ projectRegs: 600, showUp: 19, regOgx: 5, aiesecOrgSignup: 3 });
    expect(r.ogx_per_showup.smallBase).toBe(true);
    expect(r.signup_per_ogx.smallBase).toBe(true);
    expect(r.ogx_per_regs.smallBase).toBe(false);
  });
});

describe("validateInputs", () => {
  it("rejects negative and non-integer values", () => {
    const v = validateInputs({ showUp: -1, aiesecOrgSignup: 2.5, projectRegs: 600 });
    expect(Object.keys(v.errors).sort()).toEqual(["aiesecOrgSignup", "showUp"]);
  });

  it("accepts missing values", () => {
    expect(validateInputs({ showUp: null, aiesecOrgSignup: undefined })).toEqual({ errors: {}, warnings: {} });
  });

  it("logical checks warn without blocking", () => {
    const v = validateInputs({ projectRegs: 100, regOgx: 120, showUp: 150, aiesecOrgSignup: 101 });
    expect(v.errors).toEqual({});
    expect(Object.keys(v.warnings).sort()).toEqual(["aiesecOrgSignup", "regOgx", "showUp"]);
    expect(v.warnings.showUp).toContain("проверьте данные");
  });
});
