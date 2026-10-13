import { describe, expect, it } from "vitest";
import { conversions, folderNumbers, manualNumbersSchema } from "@/lib/projectNumbers";

const tracked = {
  projectRegs: 333,
  programmes: [
    { id: "ogx", title: "EwA2oGX", leads: 18 },
    { id: "mxp", title: "EwA2MXP", leads: 5 },
  ],
};

describe("folderNumbers", () => {
  it("uses the tracker's numbers until the team types its own", () => {
    const n = folderNumbers(tracked, {});
    expect(n.projectRegs).toEqual({ value: 333, tracked: 333, manual: false });
    expect(n.showUp).toEqual({ value: null, tracked: null, manual: false });
    expect(n.programmes[0].regs.value).toBe(18);

    const m = folderNumbers(tracked, { showUp: 120, signups: 60, programmes: { ogx: 40 } });
    expect(m.showUp).toEqual({ value: 120, tracked: null, manual: true });
    expect(m.programmes[0].regs).toEqual({ value: 40, tracked: 18, manual: true });
    expect(m.programmes[1].regs.manual).toBe(false);
  });
});

describe("conversions", () => {
  it("gives programme and sign-up ratios against registrations and show-up", () => {
    const c = conversions(folderNumbers(tracked, { projectRegs: 200, showUp: 100, signups: 50, programmes: { ogx: 40 } }));
    const by = Object.fromEntries(c.map((x) => [x.label, x.pct]));
    expect(by["oGX regs ÷ project regs"]).toBe(20);
    expect(by["oGX regs ÷ project show-up"]).toBe(40);
    expect(by["MXP regs ÷ project regs"]).toBe(2.5);
    expect(by["AIESEC.org sign-ups ÷ project regs"]).toBe(25);
    expect(by["AIESEC.org sign-ups ÷ project show-up"]).toBe(50);
  });

  it("shows nothing when a number is missing or the base is zero", () => {
    const c = conversions(folderNumbers({ projectRegs: 0, programmes: [] }, {}));
    expect(c.every((x) => x.pct === null)).toBe(true);
  });
});

describe("manualNumbersSchema", () => {
  it("rejects negative and fractional numbers", () => {
    expect(manualNumbersSchema.safeParse({ showUp: -1 }).success).toBe(false);
    expect(manualNumbersSchema.safeParse({ signups: 1.5 }).success).toBe(false);
    expect(manualNumbersSchema.safeParse({ showUp: 10, programmes: { a: 3 } }).success).toBe(true);
  });
});
