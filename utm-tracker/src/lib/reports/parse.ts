import { CONFIGS, detectType, normalizeSheetName, type TypeConfig } from "./configs";
import { extractSheet, findUnindentedHeading } from "./extract";
import { sanitizeDocument } from "./privacy";
import {
  PARSER_VERSION,
  SCHEMA_VERSION,
  type DefinitionsSection,
  type ParseWarning,
  type ReportDocument,
  type ReportType,
  type SheetDoc,
} from "./types";
import { ReportFileError, readWorkbook, type Workbook } from "./xlsx";

const PARSE_TIMEOUT_MS = 20_000;

/**
 * Buffer (.xlsx) → sanitised ReportDocument. Throws ReportFileError with a
 * user-facing message for files we refuse; partial problems become warnings.
 */
export async function parseReport(
  buf: Buffer | Uint8Array,
  opts: { type?: ReportType; timeoutMs?: number } = {},
): Promise<ReportDocument> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ReportFileError("timeout", "Parsing took too long. Is this the right file?")),
      opts.timeoutMs ?? PARSE_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([parseInner(buf, opts.type), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function parseInner(buf: Buffer | Uint8Array, forced?: ReportType): Promise<ReportDocument> {
  let type: ReportType | null = null;
  const wb = await readWorkbook(buf, (name, all) => {
    if (!type) {
      const detected = detectType(all);
      // A manual choice is for files we cannot recognise, not to override a clear signature.
      if (forced && detected && forced !== detected) {
        throw new ReportFileError("type_mismatch", `This file looks like a ${detected} analysis, not ${forced}.`);
      }
      type = forced ?? detected;
    }
    return type ? sheetConfigFor(CONFIGS[type], name) !== undefined : false;
  });
  if (!type) {
    throw new ReportFileError(
      "unknown_type",
      "Could not tell whether this is a Feedback or a Registration analysis. Pick the type manually.",
    );
  }
  return buildDocument(wb, type);
}

function sheetConfigFor(cfg: TypeConfig, sheetName: string) {
  const n = normalizeSheetName(sheetName);
  return cfg.sheets.find((s) => s.match.test(n));
}

/** Pure part of the pipeline, exported so tests can feed modified grids. */
export function buildDocument(wb: Workbook, type: ReportType): ReportDocument {
  const cfg = CONFIGS[type];
  const warnings: ParseWarning[] = [];

  const formulas = wb.grids.reduce((a, g) => a + g.formulaCells, 0);
  const noCache = wb.grids.reduce((a, g) => a + g.formulaNoCache, 0);
  if (formulas >= 20 && noCache / formulas > 0.5) {
    throw new ReportFileError(
      "no_cache",
      "The workbook has formulas without saved results. Open it in Excel or LibreOffice, let it recalculate, save as .xlsx and upload again.",
    );
  }
  if (noCache > 0) {
    warnings.push({
      message: `${noCache} formula cell(s) have no saved value. Open the file in Excel or LibreOffice, let it recalculate and save it again`,
    });
  }

  const sheets: SheetDoc[] = [];
  const methodology: DefinitionsSection[] = [];
  for (const sc of cfg.sheets) {
    const grid = wb.grids.find((g) => sheetConfigFor(cfg, g.name)?.key === sc.key);
    if (!grid) {
      warnings.push({ sheet: sc.label, message: "Sheet not found in the file" });
      continue;
    }
    const ex = extractSheet(grid, wb.date1904, warnings);

    for (const re of sc.expect ?? []) {
      if (!ex.sections.some((s) => re.test(s.title))) {
        const lost = findUnindentedHeading(grid, re);
        warnings.push({
          sheet: grid.name,
          section: re.source,
          message: lost
            ? `Heading '${lost}' (${normalizeSheetName(grid.name)}) lost its 2 leading spaces, so the section was not read`
            : "Expected section not found",
        });
      }
    }
    for (const s of ex.sections) {
      if (s.kind !== "table") continue;
      const rule = cfg.views.find((r) => r.sheet === sc.key && r.title.test(s.title));
      if (rule) s.views = rule.views(s);
    }

    if (sc.methodology) {
      for (const s of ex.sections) if (s.kind === "definitions") methodology.push(s);
    }
    sheets.push({ key: sc.key, label: sc.label, title: ex.title, subtitle: ex.subtitle, sections: ex.sections });
  }

  const first = sheets[0];
  // The first sheet may be titled after itself ("Özge S'26 — KPI Dashboard"); name the report instead.
  const event = first?.title.split(/\s+[—–]\s+/)[0]?.trim();
  const title = !first ? `${cfg.label} Form Analysis`
    : /dashboard/i.test(first.title) && event ? `${event} — ${cfg.label} Form Analysis`
    : first.title;
  const subtitle = first?.subtitle;
  const doc: ReportDocument = {
    schemaVersion: SCHEMA_VERSION,
    parserVersion: PARSER_VERSION,
    type,
    title,
    subtitle,
    meta: readMeta(title, subtitle),
    sheets,
    methodology,
    warnings,
    skippedSheets: wb.skipped,
  };
  return sanitizeDocument(doc);
}

function readMeta(title: string, subtitle?: string): ReportDocument["meta"] {
  const eventName = title.split(/\s+[—–]\s+/)[0]?.trim() || undefined;
  const s = subtitle ?? "";
  const n = /\bn\s*=\s*([\d,]+)/i.exec(s) ?? /([\d,]+)\s+unique registrants/i.exec(s);
  const period = /(\d{1,2}\s+[A-Za-zА-Яа-я]{3,})\s*[–—-]\s*(\d{1,2}\s+[A-Za-zА-Яа-я]{3,})/.exec(s);
  return {
    ...(eventName ? { eventName } : {}),
    ...(period ? { period: `${period[1]} – ${period[2]}` } : {}),
    ...(n ? { sampleSize: Number(n[1].replace(/,/g, "")) } : {}),
  };
}
