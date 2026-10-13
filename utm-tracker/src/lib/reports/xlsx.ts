import JSZip from "jszip";
import { SaxesParser } from "saxes";

/**
 * Minimal .xlsx reader built on the raw OOXML: cached cell values, number
 * formats and merged ranges — exactly what a dashboard-style workbook needs.
 * Excel charts/drawings are never read. Sheets the caller does not include are
 * not parsed at all; only their row count is taken from <dimension>.
 */

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
const MAX_ENTRIES = 1000;
const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

export class ReportFileError extends Error {
  constructor(
    public code:
      | "empty" | "too_large" | "not_xlsx" | "macro" | "zip_bomb" | "no_cache"
      | "unknown_type" | "type_mismatch" | "timeout" | "corrupt",
    message: string,
  ) {
    super(message);
    this.name = "ReportFileError";
  }
}

export interface RawCell {
  v: number | string | boolean | null;
  /** Number format code, "General" when none. */
  fmt: string;
  /** Style index (kept so fixtures can be rewritten with the same look). */
  s: number;
  /** A formula cell whose cached value is missing. */
  noCache?: boolean;
  /** Bold font: older templates mark section headings by bold alone, without indent. */
  b?: true;
}

export interface Merge {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface Grid {
  name: string;
  maxRow: number;
  maxCol: number;
  cells: Map<string, RawCell>; // key `${row},${col}`, 1-based
  merges: Merge[];
  formulaCells: number;
  formulaNoCache: number;
}

export interface Workbook {
  sheetNames: string[];
  grids: Grid[];
  skipped: { name: string; rows: number }[];
  date1904: boolean;
}

export const key = (r: number, c: number) => `${r},${c}`;

export function colToNum(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function numToCol(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function parseRef(ref: string): { r: number; c: number } {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.trim());
  if (!m) throw new ReportFileError("corrupt", `Bad cell reference "${ref}"`);
  return { r: Number(m[2]), c: colToNum(m[1]) };
}

// Built-in number formats that matter for values (ECMA-376 §18.8.30).
const BUILTIN_FMT: Record<number, string> = {
  0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00",
  12: "# ?/?", 13: "# ??/??", 14: "mm-dd-yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm", 37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)", 45: "mm:ss",
  46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@",
};

/** Parse an XML string with a callback per opened/closed element and text. */
function walkXml(
  xml: string,
  handlers: {
    open?: (name: string, attrs: Record<string, string>) => void;
    close?: (name: string) => void;
    text?: (t: string) => void;
  },
) {
  const p = new SaxesParser({ xmlns: false });
  p.on("opentag", (t) => handlers.open?.(localName(t.name), t.attributes as Record<string, string>));
  p.on("closetag", (t) => handlers.close?.(localName(t.name)));
  if (handlers.text) {
    p.on("text", handlers.text);
    p.on("cdata", handlers.text);
  }
  try {
    p.write(xml).close();
  } catch (e) {
    throw new ReportFileError("corrupt", `The workbook XML could not be read (${(e as Error).message}).`);
  }
}

const localName = (n: string) => (n.includes(":") ? n.slice(n.indexOf(":") + 1) : n);

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  return f ? f.async("string") : null;
}

function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = ("xl/" + target).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
}

async function openZip(buf: Buffer | Uint8Array): Promise<JSZip> {
  if (!buf || buf.length === 0) throw new ReportFileError("empty", "The file is empty.");
  if (buf.length > MAX_FILE_BYTES) {
    throw new ReportFileError("too_large", `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  }
  // Every .xlsx is a zip: it must start with the local-file-header signature.
  if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
    throw new ReportFileError("not_xlsx", "This is not an .xlsx file.");
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new ReportFileError("not_xlsx", "This is not an .xlsx file (the archive cannot be opened).");
  }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRIES) throw new ReportFileError("zip_bomb", "The archive has too many entries.");
  let total = 0;
  for (const e of entries) {
    // JSZip keeps the declared uncompressed size from the central directory.
    const size = (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    total += size;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      throw new ReportFileError("zip_bomb", "The archive unpacks to an unreasonable size.");
    }
  }
  if (!zip.file("xl/workbook.xml")) throw new ReportFileError("not_xlsx", "This is not an .xlsx workbook.");
  const ct = (await readText(zip, "[Content_Types].xml")) ?? "";
  if (zip.file("xl/vbaProject.bin") || /macroEnabled/i.test(ct)) {
    throw new ReportFileError("macro", "Macro-enabled workbooks (.xlsm) are not accepted. Save the file as .xlsx.");
  }
  return zip;
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const xml = await readText(zip, "xl/sharedStrings.xml");
  if (!xml) return [];
  const out: string[] = [];
  let cur = "";
  let inSi = false;
  let inT = false;
  let phonetic = 0;
  walkXml(xml, {
    open(n) {
      if (n === "si") { inSi = true; cur = ""; }
      else if (n === "rPh") phonetic++;
      else if (n === "t" && inSi && !phonetic) inT = true;
    },
    close(n) {
      if (n === "si") { out.push(cur); inSi = false; }
      else if (n === "rPh") phonetic--;
      else if (n === "t") inT = false;
    },
    text(t) { if (inT) cur += t; },
  });
  return out;
}

interface Styles { fmts: string[]; bold: boolean[] }

async function readStyles(zip: JSZip): Promise<Styles> {
  const xml = await readText(zip, "xl/styles.xml");
  if (!xml) return { fmts: [], bold: [] };
  const custom: Record<number, string> = {};
  const xfFmt: string[] = [];
  const xfBold: boolean[] = [];
  const fontBold: boolean[] = [];
  let inCellXfs = false, inFonts = false;
  walkXml(xml, {
    open(n, a) {
      if (n === "numFmt") custom[Number(a.numFmtId)] = a.formatCode;
      else if (n === "fonts") inFonts = true;
      else if (n === "font" && inFonts) fontBold.push(false);
      else if (n === "b" && inFonts && fontBold.length && a.val !== "0" && a.val !== "false") fontBold[fontBold.length - 1] = true;
      else if (n === "cellXfs") inCellXfs = true;
      else if (n === "xf" && inCellXfs) {
        const id = Number(a.numFmtId ?? 0);
        xfFmt.push(custom[id] ?? BUILTIN_FMT[id] ?? "General");
        xfBold.push(!!fontBold[Number(a.fontId ?? 0)]);
      }
    },
    close(n) {
      if (n === "cellXfs") inCellXfs = false;
      else if (n === "fonts") inFonts = false;
    },
  });
  return { fmts: xfFmt, bold: xfBold };
}

function parseSheet(name: string, xml: string, strings: string[], { fmts, bold }: Styles): Grid {
  const grid: Grid = { name, maxRow: 0, maxCol: 0, cells: new Map(), merges: [], formulaCells: 0, formulaNoCache: 0 };
  let cur: { r: number; c: number; t: string; s: number; hasF: boolean; v: string | null; inline: string } | null = null;
  let field: "v" | "is" | null = null;
  let inIsT = false;
  let autoRow = 0;
  let autoCol = 0;

  walkXml(xml, {
    open(n, a) {
      if (n === "row") {
        autoRow = a.r ? Number(a.r) : autoRow + 1;
        autoCol = 0;
      } else if (n === "c") {
        const pos = a.r ? parseRef(a.r) : { r: autoRow, c: autoCol + 1 };
        autoCol = pos.c;
        cur = { r: pos.r, c: pos.c, t: a.t ?? "n", s: Number(a.s ?? 0), hasF: false, v: null, inline: "" };
      } else if (cur && n === "f") cur.hasF = true;
      else if (cur && n === "v") { field = "v"; cur.v = ""; }
      else if (cur && n === "is") field = "is";
      else if (cur && field === "is" && n === "t") inIsT = true;
      else if (n === "mergeCell" && a.ref) {
        const [p1, p2] = a.ref.split(":");
        const s = parseRef(p1);
        const e = parseRef(p2 ?? p1);
        grid.merges.push({ r1: s.r, c1: s.c, r2: e.r, c2: e.c });
      }
    },
    text(t) {
      if (!cur) return;
      if (field === "v") cur.v = (cur.v ?? "") + t;
      else if (field === "is" && inIsT) cur.inline += t;
    },
    close(n) {
      if (n === "v" || n === "is") field = null;
      else if (n === "t") inIsT = false;
      else if (n === "c" && cur) {
        const c = cur;
        cur = null;
        let v: RawCell["v"] = null;
        if (c.t === "s") v = c.v === null ? null : strings[Number(c.v)] ?? null;
        else if (c.t === "inlineStr") v = c.inline;
        else if (c.t === "str" || c.t === "e") v = c.v;
        else if (c.t === "b") v = c.v === null ? null : c.v === "1";
        else v = c.v === null || c.v === "" ? null : Number(c.v);
        if (c.hasF) {
          grid.formulaCells++;
          if (c.v === null) grid.formulaNoCache++;
        }
        if (v === null && !c.hasF) return; // styled empty cell
        grid.cells.set(key(c.r, c.c), {
          v,
          fmt: fmts[c.s] ?? "General",
          s: c.s,
          ...(c.hasF && c.v === null ? { noCache: true } : {}),
          ...(bold[c.s] ? { b: true as const } : {}),
        });
        grid.maxRow = Math.max(grid.maxRow, c.r);
        grid.maxCol = Math.max(grid.maxCol, c.c);
      }
    },
  });
  return grid;
}

/** Row count from the sheet's <dimension ref="A1:AH31"/>, without parsing cells. */
function dimensionRows(xml: string): number {
  const m = /<dimension\s+ref="([^"]+)"/.exec(xml.slice(0, 4096));
  if (!m) return 0;
  const end = m[1].split(":")[1] ?? m[1];
  try {
    return parseRef(end).r;
  } catch {
    return 0;
  }
}

export async function readWorkbook(
  buf: Buffer | Uint8Array,
  include: (sheetName: string, allNames: string[]) => boolean,
): Promise<Workbook> {
  const zip = await openZip(buf);
  const wbXml = (await readText(zip, "xl/workbook.xml"))!;
  const relsXml = (await readText(zip, "xl/_rels/workbook.xml.rels")) ?? "";

  const rels: Record<string, string> = {};
  walkXml(relsXml, { open(n, a) { if (n === "Relationship") rels[a.Id] = a.Target; } });

  const sheets: { name: string; path: string }[] = [];
  let date1904 = false;
  walkXml(wbXml, {
    open(n, a) {
      if (n === "workbookPr") date1904 = a.date1904 === "1" || a.date1904 === "true";
      if (n === "sheet") {
        const rid = a["r:id"] ?? Object.entries(a).find(([k]) => k.endsWith(":id"))?.[1];
        if (rid && rels[rid]) sheets.push({ name: a.name, path: resolveTarget(rels[rid]) });
      }
    },
  });
  if (sheets.length === 0) throw new ReportFileError("not_xlsx", "The workbook has no sheets.");

  const [strings, styles] = await Promise.all([readSharedStrings(zip), readStyles(zip)]);
  const grids: Grid[] = [];
  const skipped: Workbook["skipped"] = [];
  for (const s of sheets) {
    const xml = await readText(zip, s.path);
    if (xml === null) continue;
    if (include(s.name, sheets.map((x) => x.name))) grids.push(parseSheet(s.name, xml, strings, styles));
    else skipped.push({ name: s.name, rows: dimensionRows(xml) });
  }
  return { sheetNames: sheets.map((s) => s.name), grids, skipped, date1904 };
}

/** Excel serial date → "YYYY-MM-DD" (or with "THH:MM" when it has a time part). */
export function serialToIso(serial: number, date1904 = false): string {
  const days = date1904 ? serial + 1462 : serial;
  const ms = Math.round((days - 25569) * 86_400_000);
  const d = new Date(ms);
  const iso = d.toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 16);
}
