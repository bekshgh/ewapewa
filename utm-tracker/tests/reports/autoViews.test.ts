import { describe, expect, it } from "vitest";
import { autoViews, viewsFor } from "@/lib/reports/autoViews";
import type { Column, TableSection, ValueFormat } from "@/lib/reports/types";

const TEXT: ValueFormat = { kind: "text" };
const INT: ValueFormat = { kind: "number", decimals: 0 };
const PCT: ValueFormat = { kind: "percent", decimals: 1 };
const DATE: ValueFormat = { kind: "date" };
const SIGNED: ValueFormat = { kind: "number", decimals: 2, signed: true };

function table(cols: [string, ValueFormat][], rows: (string | number | null)[][], extra: Partial<TableSection> = {}): TableSection {
  const columns: Column[] = cols.map(([label, format], i) => ({ key: `c${i}`, label, format }));
  return { kind: "table", id: "t", title: "T", columns, rows, views: [{ type: "table" }], ...extra };
}

describe("charts picked for plain tables", () => {
  it("draws a day-by-day log as bars, with a line for the cumulative column", () => {
    const t = table([["Date", DATE], ["Registrations", INT], ["Cumulative", INT]],
      [["2026-01-12", 43, 43], ["2026-01-13", 30, 73], ["2026-01-14", 22, 95]]);
    expect(autoViews(t)).toEqual([{ type: "bars", label: 0, values: [1] }, { type: "line", label: 0, values: [2] }, { type: "table" }]);
  });

  it("ranks a list with one count and its share", () => {
    const t = table([["#", INT], ["University", TEXT], ["Count", INT], ["Share", PCT]],
      [[1, "NU", 182, 0.31], [2, "AITU", 130, 0.22], [3, "ENU", 40, 0.07], [4, "Other", 30, 0.05], [5, "KBTU", 20, 0.03], [6, "SDU", 10, 0.02], [7, "KIMEP", 5, 0.01]]);
    expect(autoViews(t)).toEqual([{ type: "ranked", label: 1, value: 2, share: 3 }]);
  });

  it("shows a small split that adds up to 100% as a doughnut", () => {
    const t = table([["Role", TEXT], ["Count", INT], ["Share", PCT]], [["Captain", 448, 0.27], ["Member", 900, 0.54], ["Individual", 323, 0.19]]);
    expect(autoViews(t)[0]).toEqual({ type: "doughnut", label: 0, value: 1 });
  });

  it("colours a matrix of numbers as a heat table; signed gaps diverge", () => {
    const m = table([["University", TEXT], ["Y1", INT], ["Y2", INT], ["Y3", INT]], [["NU", 109, 110, 106], ["AITU", 120, 90, 26]]);
    expect(autoViews(m)).toEqual([{ type: "heat", from: 1, to: 3 }]);
    const g = table([["Metric", TEXT], ["Gap A", SIGNED], ["Gap B", SIGNED]], [["Org", 0.2, -0.1], ["Coffee", -0.5, 0.3]]);
    expect(autoViews(g)).toEqual([{ type: "heat", from: 1, to: 2, diverging: true }]);
  });

  it("draws average scores as bars over a heat table", () => {
    const AVG: ValueFormat = { kind: "number", decimals: 2 };
    const t = table([["Driver", TEXT], ["All Avg", AVG], ["PE Avg", AVG], ["Mktg Avg", AVG]], [["Learning", 4.2, 4.12, 4.3], ["Fun", 3.9, 3.8, 4.0]]);
    expect(autoViews(t)).toEqual([{ type: "bars", label: 0, values: [1], horizontal: true }, { type: "heat", from: 1, to: 3 }]);
  });

  it("leaves text-only, one-row, long and Metric | Value tables alone", () => {
    expect(autoViews(table([["Signal", TEXT], ["Insight", TEXT]], [["a", "b"], ["c", "d"]]))).toEqual([{ type: "table" }]);
    expect(autoViews(table([["Channel", TEXT], ["Count", INT]], [["Telegram", 5]]))).toEqual([{ type: "table" }]);
    const long = table([["Key", TEXT], ["Count", INT]], Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
    expect(autoViews(long)).toEqual([{ type: "table" }]);
    const mixed = table([["Metric", TEXT], ["Value", INT]], [["Raw", 10], ["Rate", 0.1]]);
    mixed.columns[1].cellFormats = [INT, PCT];
    expect(autoViews(mixed)).toEqual([{ type: "table" }]);
  });

  it("keeps the views a config already chose", () => {
    const t = table([["Channel", TEXT], ["Regs", INT]], [["Telegram", 5], ["Instagram", 3]], { views: [{ type: "table", searchable: true }] });
    expect(viewsFor(t)).toBe(t.views);
  });
});
