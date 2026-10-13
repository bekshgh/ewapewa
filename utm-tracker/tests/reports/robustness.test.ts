import { describe, expect, it } from "vitest";
import { CONFIGS, detectType, normalizeSheetName } from "@/lib/reports/configs";
import { buildDocument, parseReport } from "@/lib/reports/parse";
import { maskText } from "@/lib/reports/privacy";
import { readWorkbook, ReportFileError, key, type Grid } from "@/lib/reports/xlsx";
import { FEEDBACK_FILE, REGISTRATION_FILE, load, makeXlsx, section } from "./helpers";

const readFor = (file: string) =>
  readWorkbook(load(file), (name, all) => {
    const t = detectType(all)!;
    return CONFIGS[t].sheets.some((s) => s.match.test(normalizeSheetName(name)));
  });

/** Insert a copy of row `r` below it, shifting everything underneath down. */
function duplicateRow(g: Grid, r: number) {
  const cells = new Map<string, Grid["cells"] extends Map<string, infer V> ? V : never>();
  for (const [k, v] of g.cells) {
    const [rr, cc] = k.split(",").map(Number);
    cells.set(key(rr > r ? rr + 1 : rr, cc), v);
    if (rr === r) cells.set(key(r + 1, cc), { ...v });
  }
  g.cells = cells;
  g.merges = g.merges.flatMap((m) => {
    const moved = m.r1 > r ? { ...m, r1: m.r1 + 1, r2: m.r2 + 1 } : m;
    return m.r1 === r ? [moved, { ...m, r1: r + 1, r2: r + 1 }] : [moved];
  });
  g.maxRow++;
}

function rowOf(g: Grid, text: string): number {
  for (const [k, v] of g.cells) if (v.v === text) return Number(k.split(",")[0]);
  throw new Error(`no row with ${text}`);
}

describe("layout robustness", () => {
  it("survives an extra theme row (everything below shifts by one)", async () => {
    const wb = await readFor(FEEDBACK_FILE);
    const g = wb.grids.find((x) => /Themes/.test(x.name))!;
    duplicateRow(g, rowOf(g, "Friendly team & atmosphere"));
    const doc = buildDocument(wb, "feedback");
    expect(doc.warnings).toEqual([]);
    expect(section(doc, "themes", /WHAT THEY LIKED/, "table").rows).toHaveLength(7);
    expect(section(doc, "themes", /PAIN POINTS/, "table").rows).toHaveLength(8);
    expect(section(doc, "themes", /REQUESTS/, "table").rows).toHaveLength(7);
  });

  it("survives an extra channel row in the head-to-head table", async () => {
    const wb = await readFor(REGISTRATION_FILE);
    const g = wb.grids.find((x) => /KPI Dashboard/.test(x.name))!;
    duplicateRow(g, rowOf(g, "QR Poster"));
    const doc = buildDocument(wb, "registration");
    const t = section(doc, "overview", /HEAD-TO-HEAD/, "table");
    expect(t.rows).toHaveLength(16);
    expect(t.rows[t.totalRow!][0]).toBe("All channels");
  });

  it("refuses a workbook whose formulas have no saved results", async () => {
    const wb = await readFor(FEEDBACK_FILE);
    wb.grids[0].formulaCells = 100;
    wb.grids[0].formulaNoCache = 90;
    expect(() => buildDocument(wb, "feedback")).toThrow(/recalculate/);
  });

  it("reads a formula cell without a cached value as missing", async () => {
    const buf = await makeXlsx({ S: `<row r="1"><c r="A1"><f>1+1</f></c><c r="B1"><f>1+1</f><v>0</v></c></row>` });
    const wb = await readWorkbook(buf, () => true);
    const g = wb.grids[0];
    expect(g.cells.get("1,1")).toMatchObject({ v: null, noCache: true });
    expect(g.cells.get("1,2")).toMatchObject({ v: 0 }); // a cached zero is a real zero
  });
});

describe("rejected files give clear errors", () => {
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(ReportFileError);
      return (e as ReportFileError).code;
    }
    throw new Error("did not throw");
  };

  it("empty file", async () => expect(await code(parseReport(Buffer.alloc(0)))).toBe("empty"));
  it("not an xlsx", async () => expect(await code(parseReport(Buffer.from("hello, this is a csv\n1,2,3")))).toBe("not_xlsx"));
  it("zip that is not a workbook", async () => {
    const JSZip = (await import("jszip")).default;
    const z = new JSZip();
    z.file("readme.txt", "hi");
    expect(await code(parseReport(await z.generateAsync({ type: "nodebuffer" })))).toBe("not_xlsx");
  });
  it("macro-enabled workbook", async () => {
    const buf = await makeXlsx({ S: "" }, { "xl/vbaProject.bin": "x" });
    expect(await code(parseReport(buf))).toBe("macro");
  });
  it("unknown structure", async () => {
    const buf = await makeXlsx({ "Sheet1": `<row r="1"><c r="A1" t="inlineStr"><is><t>hi</t></is></c></row>` });
    expect(await code(parseReport(buf))).toBe("unknown_type");
  });
  it("too large", async () => {
    const buf = Buffer.alloc(5 * 1024 * 1024, 0);
    buf.write("PK\u0003\u0004", 0, "latin1");
    expect(await code(parseReport(buf))).toBe("too_large");
  });
});

describe("privacy", () => {
  it("published JSON carries no emails, phones or outlier names", async () => {
    for (const file of [FEEDBACK_FILE, REGISTRATION_FILE]) {
      const json = JSON.stringify(await parseReport(load(file)));
      expect(json).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
      expect(json).not.toMatch(/(?<![\d.])\+?[78][\s(-]?\d{3}[\s)-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/);
      expect(json).not.toMatch(/Test Person/);
    }
  });

  it("masks contacts inside free text", () => {
    expect(maskText("write to ivan.petrov@mail.kz or +7 701 123 45 67")).toBe("write to [email hidden] or [phone hidden]");
    expect(maskText("dates 2026-08-21 and 603 registrants stay")).toBe("dates 2026-08-21 and 603 registrants stay");
  });
});

describe("detectType", () => {
  it("recognises a workbook with one signature sheet renamed or dropped", () => {
    expect(detectType(["01 · Trend Dashboard", "02 · Channel Dashboard", "03 · Audience"])).toBe("registration");
    expect(detectType(["Satisfaction & Themes", "Operational Scorecard"])).toBe("feedback");
  });
  it("stays unsure when sheets of both types are present, or too few", () => {
    expect(detectType(["Trend Dashboard", "Channel Dashboard", "Operational Scorecard"])).toBeNull();
    expect(detectType(["Trend Dashboard", "Sheet1"])).toBeNull();
  });
});

describe("older templates", () => {
  it("take a bold upper-case line as a section heading, but not a short bold value", async () => {
    const { parseHeading } = await import("@/lib/reports/extract");
    expect(parseHeading("CAMPAIGN OVERVIEW", true)?.title).toBe("CAMPAIGN OVERVIEW");
    expect(parseHeading("CAMPAIGN OVERVIEW", false)).toBeNull();
    expect(parseHeading("NU", true)).toBeNull();
  });
});
