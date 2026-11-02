import { pickBestSheet } from "./forecastCore";

/**
 * Data source B of the attendance forecast: a registration sheet read in the browser with SheetJS.
 * The file holds personal data, so it is never sent anywhere or stored.
 */

export interface LoadedSheet {
  name: string;
  /** First row of the sheet. */
  headers: string[];
  /** One object per row, keyed by header (SheetJS sheet_to_json). */
  objects: Record<string, unknown>[];
}

export interface LoadedFile {
  fileName: string;
  sheets: LoadedSheet[];
  /** The sheet whose headers match the most fields. */
  best: string | null;
}

function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1251").decode(buf);
  }
}

export async function readRegistrationSheet(file: File): Promise<LoadedFile> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  // CSV bytes would be read as Latin-1: decode them first (Google Sheets: UTF-8, Excel: often Windows-1251)
  const wb = /\.csv$/i.test(file.name) || file.type === "text/csv"
    ? XLSX.read(decodeText(buf), { type: "string", cellDates: true })
    : XLSX.read(buf, { type: "array", cellDates: true });
  const sheets = wb.SheetNames.map((name): LoadedSheet => {
    const ws = wb.Sheets[name];
    const first = (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })[0] ?? []) as unknown[];
    return {
      name,
      headers: first.map((h) => (h === null || h === undefined ? "" : String(h))).filter(Boolean),
      objects: XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true }),
    };
  });
  return { fileName: file.name, sheets, best: pickBestSheet(sheets) };
}
