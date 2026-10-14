import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIGS, detectType, normalizeSheetName } from "@/lib/reports/configs";
import { buildDocument } from "@/lib/reports/parse";
import { readWorkbook, key } from "@/lib/reports/xlsx";
import { FIXTURES, load } from "./helpers";

// Common hand-edit mistakes, made on an in-memory copy of a kit workbook: each
// must produce a specific warning instead of passing silently.
const KIT_REGISTRATION = path.join(FIXTURES, "Kit_ICY_S26_Registration_Form_Analysis.xlsx");

async function kitWorkbook() {
  const wb = await readWorkbook(load(KIT_REGISTRATION), (name, all) =>
    CONFIGS[detectType(all)!].sheets.some((s) => s.match.test(normalizeSheetName(name))),
  );
  const grid = (re: RegExp) => wb.grids.find((g) => re.test(g.name))!;
  return { wb, grid };
}

describe("parser diagnostics", () => {
  it("the untouched kit workbook has no warnings", async () => {
    const { wb } = await kitWorkbook();
    expect(buildDocument(wb, "registration").warnings).toEqual([]);
  });

  it("names a heading that lost its 2 leading spaces", async () => {
    const { wb, grid } = await kitWorkbook();
    const cell = grid(/Audience/).cells.get(key(24, 2))!;
    expect(cell.v).toBe("  UNIVERSITY");
    cell.v = "UNIVERSITY";
    expect(buildDocument(wb, "registration").warnings).toContainEqual({
      sheet: "04 · Audience Dashboard",
      section: "UNIVERSITY",
      message: "Heading 'UNIVERSITY' (Audience Dashboard) lost its 2 leading spaces, so the section was not read",
    });
  });

  it("flags percentages stored as text in a table column", async () => {
    const { wb, grid } = await kitWorkbook();
    const g = grid(/Audience/);
    expect(g.cells.get(key(25, 7))?.v).toBe("Share");
    const cell = g.cells.get(key(26, 7))!;
    expect(typeof cell.v).toBe("number");
    g.cells.set(key(26, 7), { ...cell, v: "22.6%", fmt: "General" });
    expect(buildDocument(wb, "registration").warnings).toContainEqual({
      sheet: "04 · Audience Dashboard",
      section: "UNIVERSITY",
      message: "Column Share holds percentages stored as text; write numbers with a % format",
    });
  });

  it("flags dates stored as text in a Date column", async () => {
    const { wb, grid } = await kitWorkbook();
    const g = grid(/Trend/);
    expect(g.cells.get(key(12, 2))?.v).toBe("Date");
    const cell = g.cells.get(key(13, 2))!;
    expect(typeof cell.v).toBe("number");
    g.cells.set(key(13, 2), { ...cell, v: "2026-05-23", fmt: "General" });
    expect(buildDocument(wb, "registration").warnings).toContainEqual({
      sheet: "02 · Trend Dashboard",
      section: "DAY-BY-DAY TABLE",
      message: "Column Date holds dates stored as text; write real dates with a date format",
    });
  });

  it("counts formula cells without a saved value, below the rejection threshold", async () => {
    const { wb } = await kitWorkbook();
    wb.grids[0].formulaCells = 10;
    wb.grids[0].formulaNoCache = 3;
    expect(buildDocument(wb, "registration").warnings).toContainEqual({
      message: "3 formula cell(s) have no saved value. Open the file in Excel or LibreOffice, let it recalculate and save it again",
    });
  });

  it("still rejects a workbook where most formulas have no saved value", async () => {
    const { wb } = await kitWorkbook();
    wb.grids[0].formulaCells = 20;
    wb.grids[0].formulaNoCache = 11;
    expect(() => buildDocument(wb, "registration")).toThrow(/recalculate/);
  });
});
