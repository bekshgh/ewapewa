import type { SourceRow } from "./quality";

/**
 * A registration table (Google Sheet tab or uploaded CSV/XLSX) as a header row
 * plus string cells, and the mapping of its columns onto SourceRow.
 */

export interface ColumnMap {
  emailCol: string;
  timeCol?: string | null;
  nameCol?: string | null;
  phoneCol?: string | null;
  utmCol?: string | null;
}

const GUESS: Record<keyof ColumnMap, RegExp> = {
  emailCol: /e-?mail|почта|mail/i,
  timeCol: /timestamp|отметка времени|время|date|дата|submitted/i,
  nameCol: /^(name|имя|фио|full name|аты-жөні)|имя|name/i,
  phoneCol: /phone|телефон|номер|whatsapp|tel/i,
  utmCol: /utm_?campaign|utm/i,
};

const EMAILISH = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Suggests a column for each field by header name, and for email also by content. */
export function guessColumns(table: string[][]): Partial<ColumnMap> {
  const [header = [], ...rows] = table;
  const out: Partial<ColumnMap> = {};
  for (const field of Object.keys(GUESS) as (keyof ColumnMap)[]) {
    const h = header.find((x) => GUESS[field].test(x) && !Object.values(out).includes(x));
    if (h) out[field] = h;
  }
  if (!out.emailCol) {
    // the column where most non-empty cells look like an email
    let best = -1;
    let bestShare = 0;
    header.forEach((_, i) => {
      const vals = rows.map((r) => (r[i] ?? "").trim()).filter(Boolean);
      const share = vals.length ? vals.filter((v) => EMAILISH.test(v)).length / vals.length : 0;
      if (share > bestShare) [best, bestShare] = [i, share];
    });
    if (best >= 0 && bestShare >= 0.5) out.emailCol = header[best];
  }
  return out;
}

/** Column headers with a few sample values, for the settings preview (admin only). */
export function previewColumns(table: string[][], samples = 3): { name: string; samples: string[] }[] {
  const [header = [], ...rows] = table;
  return header.map((name, i) => ({
    name,
    samples: rows.map((r) => (r[i] ?? "").trim()).filter(Boolean).slice(0, samples),
  }));
}

/** "11.10.2026 14:03:22", "10/11/2026 14:03:22", ISO… → Date, or null. */
export function parseSheetDate(v: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Google Forms / Sheets in RU/KZ use day-first with dots; with slashes they are month-first (US) — try both.
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  let [, a, b] = m;
  const [, , , y, hh = "0", mm = "0", ss = "0"] = m;
  if (s.includes("/") && Number(a) <= 12) [a, b] = [b, a]; // month/day/year
  const d = new Date(Date.UTC(Number(y), Number(b) - 1, Number(a), Number(hh), Number(mm), Number(ss)));
  return Number.isNaN(d.getTime()) || Number(b) > 12 ? null : d;
}

export class ColumnError extends Error {}

export function tableToRows(table: string[][], map: ColumnMap): SourceRow[] {
  const [header = [], ...rows] = table;
  const idx = (col?: string | null) => (col ? header.indexOf(col) : -1);
  const email = idx(map.emailCol);
  if (email < 0) throw new ColumnError(`В таблице нет колонки «${map.emailCol}». Выберите колонку email заново.`);
  const time = idx(map.timeCol);
  const name = idx(map.nameCol);
  const phone = idx(map.phoneCol);
  const utm = idx(map.utmCol);
  return rows
    .map((r, i) => ({ r, line: i + 2 })) // sheet row number (1 = header)
    .filter(({ r }) => r.some((c) => c.trim()))
    .map(({ r, line }) => ({
      email: r[email] ?? "",
      name: name >= 0 ? r[name] : null,
      phone: phone >= 0 ? r[phone] : null,
      at: time >= 0 ? parseSheetDate(r[time] ?? "") : null,
      // only a configured UTM column makes "missing_utm" meaningful
      ...(utm >= 0 ? { utm: r[utm] ?? "" } : {}),
      ref: `row ${line}`,
    }));
}

/* ─── uploaded files ────────────────────────────────────────────── */

/** RFC 4180 CSV (quotes, escaped quotes, newlines in quotes); `;` or `,` separated. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim()));
}

/** First sheet (or the named one) of an .xlsx as strings, via the reports' xlsx reader. */
export async function parseXlsx(buf: Buffer, tab?: string | null): Promise<{ tabs: string[]; table: string[][] }> {
  const { readWorkbook, key, serialToIso } = await import("@/lib/reports/xlsx");
  const wb = await readWorkbook(buf, (name, all) => (tab ? name === tab : name === all[0]));
  const grid = wb.grids[0];
  if (!grid) return { tabs: wb.sheetNames, table: [] };
  const table: string[][] = [];
  for (let r = 1; r <= grid.maxRow; r++) {
    const row: string[] = [];
    for (let c = 1; c <= grid.maxCol; c++) {
      const cell = grid.cells.get(key(r, c));
      let v = cell?.v ?? "";
      if (typeof v === "number" && cell && /[dmyh]/i.test(cell.fmt) && cell.fmt !== "General") v = serialToIso(v, wb.date1904);
      row.push(String(v));
    }
    table.push(row);
  }
  return { tabs: wb.sheetNames, table: table.filter((r) => r.some((c) => c.trim())) };
}
