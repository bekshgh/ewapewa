import type {
  CalloutSection,
  CellValue,
  Column,
  DefinitionsSection,
  KpiCard,
  KpiSection,
  ParseWarning,
  Row,
  Section,
  TableSection,
} from "./types";
import { key, type Grid, type Merge, type RawCell } from "./xlsx";
import { cellValue, classifyFormat, cleanText, isDecorative, parseCountShare, splitSignal } from "./values";

/**
 * Layout-driven extraction from one dashboard sheet. Nothing is tied to cell
 * addresses: sections are found by their headings, a heading's merged span is
 * the section's column zone, and inside a zone blank rows separate blocks
 * (KPI cards, tables, callouts, definitions).
 */

export interface SheetExtract {
  title: string;
  subtitle?: string;
  sections: Section[];
}

interface Item {
  c: number; // first column
  c2: number; // last column of the merged span
  raw: RawCell;
  value: CellValue;
}

interface Line {
  r: number;
  items: Item[];
}

interface Heading {
  r: number;
  c: number;
  c2: number;
  title: string;
  subtitle?: string;
}

const DECOR_CHARS = /[█░▓▒■□●○◉◯★☆]/;

export function extractSheet(grid: Grid, date1904: boolean, warnings: ParseWarning[]): SheetExtract {
  const spans = mergeIndex(grid.merges);
  const headings = findHeadings(grid, spans);

  // Sheet title / subtitle: the first text lines above the first heading.
  const firstHeadingRow = headings[0]?.r ?? grid.maxRow + 1;
  const top = linesIn(grid, spans, 1, firstHeadingRow - 1, 1, grid.maxCol, date1904)
    .map((l) => l.items.find((i) => typeof i.value === "string")?.value as string | undefined)
    .filter((t): t is string => Boolean(t));

  const sections: Section[] = [];
  const ids = new Set<string>();
  for (const h of headings) {
    const end = zoneEnd(h, headings, grid.maxRow);
    const lines = linesIn(grid, spans, h.r + 1, end, h.c, h.c2, date1904);
    const blocks = splitBlocks(lines);
    const before = sections.length;
    for (const block of blocks) buildSections(block, h, sections, ids, grid.name, warnings);
    if (sections.length === before && blocks.length > 0) {
      warnings.push({ sheet: grid.name, section: h.title, message: "Section content was not recognised" });
    }
  }
  return { title: top[0] ?? grid.name, subtitle: top[1], sections };
}

/* ─── layout helpers ─────────────────────────────────────────────── */

function mergeIndex(merges: Merge[]) {
  const master = new Map<string, Merge>();
  const covered = new Set<string>();
  for (const m of merges) {
    master.set(key(m.r1, m.c1), m);
    for (let r = m.r1; r <= m.r2; r++)
      for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(key(r, c));
  }
  return { master, covered };
}

type Spans = ReturnType<typeof mergeIndex>;

/** "  SCORE SUMMARY  —  ALL RESPONDENTS vs …" → heading. Indented + upper-case. */
export function parseHeading(raw: string, bold = false): { title: string; subtitle?: string } | null {
  // Older templates: no indent, but bold.
  if (!/^\s{2,}\S/.test(raw) && !bold) return null;
  const t = raw.trim();
  // Title ends at " — ", at " (" or at "  ·  "; the rest is the subtitle.
  const m = /\s+[—–]\s+|\s+(?=\()|\s{2,}·\s{2,}/.exec(t);
  let title = cleanText(m ? t.slice(0, m.index) : t);
  let sub = m ? t.slice(m.index + m[0].length).trim() : undefined;
  if (sub?.startsWith("(")) {
    const close = sub.indexOf(")");
    sub = close > 0 ? `${sub.slice(1, close)} ${sub.slice(close + 1)}` : sub.slice(1);
  }
  sub = sub ? cleanText(sub.replace(/^[·\s]+/, "")) : undefined;
  const letters = title.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
  if (letters.length < 2) return null;
  // a bold short value ("NU", "AITU") in a table is not a heading
  if (!/^\s{2,}\S/.test(raw) && (letters.length < 6 || /^\s*[\d#▶]/.test(raw))) return null;
  const upper = letters.replace(/[^A-ZА-ЯЁ]/g, "").length;
  if (upper / letters.length < 0.7) return null;
  // Drop list markers like "A · " or "E1 · ".
  title = title.replace(/^[A-Z]\d?\s*·\s*/, "");
  return { title, subtitle: sub || undefined };
}

function findHeadings(grid: Grid, spans: Spans): Heading[] {
  const out = collectHeadings(grid, spans, false);
  // Older templates have no indented headings at all: their headings are just bold.
  return out.length ? out : collectHeadings(grid, spans, true);
}

function collectHeadings(grid: Grid, spans: Spans, byBold: boolean): Heading[] {
  const out: Heading[] = [];
  for (const [k, cell] of grid.cells) {
    if (typeof cell.v !== "string" || spans.covered.has(k)) continue;
    const h = parseHeading(cell.v, byBold && cell.b === true);
    if (!h) continue;
    const [r, c] = k.split(",").map(Number);
    const m = spans.master.get(k);
    out.push({ r, c, c2: m ? m.c2 : c, ...h });
  }
  out.sort((a, b) => a.r - b.r || a.c - b.c);
  // An unmerged heading reaches to the next heading on its row, or the sheet edge.
  for (const h of out) {
    if (h.c2 > h.c) continue;
    const next = out.find((o) => o.r === h.r && o.c > h.c);
    h.c2 = next ? next.c - 1 : grid.maxCol;
  }
  return out;
}

/** A zone ends right before the next heading that overlaps its columns. */
function zoneEnd(h: Heading, all: Heading[], maxRow: number): number {
  const next = all.find((o) => o.r > h.r && o.c <= h.c2 && o.c2 >= h.c);
  return next ? next.r - 1 : maxRow;
}

function linesIn(grid: Grid, spans: Spans, r1: number, r2: number, c1: number, c2: number, date1904: boolean): Line[] {
  const lines: Line[] = [];
  for (let r = r1; r <= r2; r++) {
    const items: Item[] = [];
    for (let c = c1; c <= c2; c++) {
      const k = key(r, c);
      if (spans.covered.has(k)) continue;
      const raw = grid.cells.get(k);
      if (!raw) continue;
      const m = spans.master.get(k);
      if (raw.v === null && !raw.noCache) continue;
      const value = cellValue(raw, date1904);
      items.push({ c, c2: m ? Math.min(m.c2, c2) : c, raw, value });
    }
    lines.push({ r, items });
  }
  return lines;
}

/** Blank lines separate blocks. A line of only decorative / empty cells counts as blank. */
function splitBlocks(lines: Line[]): Line[][] {
  const blocks: Line[][] = [];
  let cur: Line[] = [];
  for (const l of lines) {
    const meaningful = l.items.some((i) => i.value !== null || i.raw.noCache || isNullText(i.raw));
    if (!meaningful) {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

const isNullText = (raw: RawCell) => typeof raw.v === "string" && /^\s*[–—-]\s*$/.test(raw.v);

const isUpperLabel = (v: CellValue) => {
  if (typeof v !== "string") return false;
  const letters = v.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
  return letters.length >= 2 && letters.replace(/[^A-ZА-ЯЁ]/g, "").length / letters.length >= 0.8;
};

/* ─── block classification ───────────────────────────────────────── */

function buildSections(
  block: Line[],
  h: Heading,
  out: Section[],
  ids: Set<string>,
  sheet: string,
  warnings: ParseWarning[],
) {
  const id = () => uniqueId(slug(h.title), ids);
  const prev = out[out.length - 1];
  const sameHeading = (s: Section | undefined) => s && s.title === h.title;

  // 1. KPI cards: label row (upper-case), value row, optional caption row.
  if (isKpiBlock(block)) {
    const cards: KpiCard[] = [];
    for (let i = 0; i < block.length; i += 3) {
      const [labels, values, subs] = [block[i], block[i + 1], block[i + 2]];
      for (const lab of labels.items) {
        const val = values?.items.find((x) => x.c === lab.c);
        const sub = subs?.items.find((x) => x.c === lab.c);
        const subtext = typeof sub?.value === "string" ? sub.value : undefined;
        const signal = subtext ? splitSignal(subtext) : undefined;
        cards.push({
          label: cleanText(String(lab.value)).replace(/\*$/, ""),
          value: val ? (val.raw.noCache ? null : val.value) : null,
          format: val ? formatOf(val.raw) : { kind: "text" },
          ...(subtext ? { subtext: signal!.text } : {}),
          ...(signal && signal.tone !== "neutral" ? { tone: signal.tone } : {}),
        });
      }
    }
    if (sameHeading(prev) && prev!.kind === "kpiGroup") (prev as KpiSection).cards.push(...cards);
    else out.push({ kind: "kpiGroup", id: id(), title: h.title, subtitle: h.subtitle, cards });
    return;
  }

  // 2. Callouts: "▶ | text" or "▶ Label | description" lines.
  if (block.every(isCalloutLine)) {
    const items = block.map((l) => {
      const [a, b] = l.items;
      if (b && typeof a.raw.v === "string" && cleanText(a.raw.v).length <= 2) {
        const s = splitSignal(String(b.value));
        return { text: s.text, tone: toneToCallout(s.tone) };
      }
      const s = splitSignal(String(a.raw.v));
      return b
        ? { label: s.text, text: cleanText(String(b.value)), tone: toneToCallout(s.tone === "neutral" ? splitSignal(String(b.value)).tone : s.tone) }
        : { text: s.text, tone: toneToCallout(s.tone) };
    });
    const sec: CalloutSection = { kind: "callouts", id: id(), title: h.title, subtitle: h.subtitle, items };
    out.push(sec);
    return;
  }

  // 3. Definitions: "term | long definition" pairs (Notes sheets).
  if (block.every((l) => l.items.length === 2 && typeof l.items[0].value === "string" && typeof l.items[1].value === "string")
      && avg(block.map((l) => String(l.items[1].value).length)) > 25) {
    const items = block.map((l) => ({ term: String(l.items[0].value), definition: String(l.items[1].value) }));
    if (sameHeading(prev) && prev!.kind === "definitions") (prev as DefinitionsSection).items.push(...items);
    else out.push({ kind: "definitions", id: id(), title: h.title, subtitle: h.subtitle, items });
    return;
  }

  // 4. A lone line of prose: a note on the previous table, or a footnote callout.
  if (block.length === 1 && block[0].items.length === 1 && typeof block[0].items[0].value === "string") {
    const text = String(block[0].items[0].value);
    if (prev?.kind === "table" && sameHeading(prev)) prev.note = prev.note ? `${prev.note}\n${text}` : text;
    else out.push({ kind: "callouts", id: id(), title: h.title, subtitle: h.subtitle, items: [{ text, tone: "info" }] });
    return;
  }

  // 5. Table: header line + data lines (a trailing prose line becomes the note).
  const table = buildTable(block, h, sheet, warnings);
  if (table) {
    table.id = id();
    out.push(table);
  }
}

function isKpiBlock(block: Line[]): boolean {
  if (block.length < 2 || block.length % 3 === 1) return false;
  for (let i = 0; i < block.length; i += 3) {
    const labels = block[i].items;
    if (labels.length < 2 || !labels.every((x) => isUpperLabel(x.value))) return false;
    const values = block[i + 1]?.items ?? [];
    if (!values.length || !values.every((v) => labels.some((l) => l.c === v.c))) return false;
  }
  return true;
}

function isCalloutLine(l: Line): boolean {
  const [a, b] = l.items;
  if (!a || l.items.length > 2 || typeof a.raw.v !== "string") return false;
  const lead = a.raw.v.trimStart()[0];
  return lead !== undefined && "▶▸►•⚠✓✔".includes(lead) && (!b || typeof b.value === "string");
}

function buildTable(block: Line[], h: Heading, sheet: string, warnings: ParseWarning[]): TableSection | null {
  const [head, ...rest] = block;
  if (head.items.length < 2) return null;

  // Column ranges: a header covers its merged span, or up to the next header.
  const hdr = head.items;
  const ranges = hdr.map((it, i) => ({
    c1: it.c,
    c2: it.c2 > it.c ? it.c2 : i + 1 < hdr.length ? hdr[i + 1].c - 1 : it.c,
  }));

  let note: string | undefined;
  const dataLines: Line[] = [];
  for (const l of rest) {
    const prose = l.items.length === 1 && typeof l.items[0].value === "string" && String(l.items[0].value).length > 40;
    if (prose) {
      note = note ? `${note}\n${l.items[0].value}` : String(l.items[0].value);
      continue;
    }
    dataLines.push(l);
  }
  if (dataLines.length === 0) return null;

  // Raw matrix (header-aligned).
  const raw: (Item | undefined)[][] = dataLines.map((l) => {
    const row: (Item | undefined)[] = new Array(hdr.length).fill(undefined);
    for (const it of l.items) {
      const ci = ranges.findIndex((rg) => it.c >= rg.c1 && it.c <= rg.c2);
      if (ci >= 0 && row[ci] === undefined) row[ci] = it;
    }
    return row;
  });

  const columns: Column[] = [];
  const colData: CellValue[][] = [];
  let missingCache = 0;
  hdr.forEach((hc, ci) => {
    const cells = raw.map((r) => r[ci]);
    let label = headerLabel(hc);
    // A bare "%" header belongs to the column on its left ("4–6 (Mid)" | "%").
    if (label === "%" && ci > 0) label = `${headerLabel(hdr[ci - 1])} %`;
    const strings = cells.filter((c) => c && typeof c.raw.v === "string").map((c) => String(c!.raw.v));

    // Pure decoration (bars / dots drawn with glyphs): drop.
    if (cells.every((c) => !c || c.value === null || isDecorative(c.raw.v))) {
      if (strings.some((s) => DECOR_CHARS.test(s)) || cells.every((c) => !c)) return;
    }
    // "22  (73%)  ███" cells → a count column and a share column.
    if (strings.length > 0 && strings.length === cells.filter(Boolean).length && strings.every((s) => parseCountShare(s))) {
      const parsed = cells.map((c) => (c ? parseCountShare(String(c.raw.v)) : null));
      columns.push({ key: "", label, format: { kind: "number", decimals: 0 } });
      colData.push(parsed.map((p) => p?.count ?? null));
      columns.push({ key: "", label: `${label} %`, format: { kind: "percent", decimals: 0 } });
      colData.push(parsed.map((p) => p?.share ?? null));
      return;
    }
    // "●●●●○  4.43" — a glyph rating restating a number shown elsewhere: drop.
    if (strings.length > 0 && strings.every((s) => DECOR_CHARS.test(s))) return;

    const numeric = cells.find((c) => c && typeof c.raw.v === "number");
    const format = numeric ? formatOf(numeric.raw) : { kind: "text" as const };
    const perRow = cells.map((c) => (c && typeof c.raw.v === "number" ? formatOf(c.raw) : null));
    const mixed = perRow.some((f) => f && JSON.stringify(f) !== JSON.stringify(format));
    columns.push({ key: "", label, format, ...(mixed ? { cellFormats: perRow } : {}) });
    colData.push(cells.map((c) => {
      if (!c) return null;
      if (c.raw.noCache) { missingCache++; return null; }
      return c.value;
    }));
  });
  if (columns.length < 2) return null;
  if (missingCache > 0) {
    warnings.push({ sheet, section: h.title, message: `${missingCache} formula cell(s) had no saved value and are shown as empty` });
  }

  const usedKeys = new Set<string>();
  columns.forEach((c) => (c.key = uniqueId(slug(c.label) || "col", usedKeys)));
  const rows: Row[] = dataLines.map((_, ri) => colData.map((col) => col[ri]));
  const totalRow = rows.findIndex((r) => typeof r[0] === "string" && /^(all\b|total\b)/i.test(String(r[0])));

  return {
    kind: "table",
    id: "",
    title: h.title,
    subtitle: h.subtitle,
    columns,
    rows,
    ...(totalRow >= 0 ? { totalRow } : {}),
    ...(note ? { note } : {}),
    views: [{ type: "table" }],
  };
}

function headerLabel(it: Item): string {
  if (typeof it.value === "string" && /^\d{4}-\d{2}-\d{2}/.test(it.value) && typeof it.raw.v === "number") {
    const d = new Date(it.value + "T00:00:00Z");
    return `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
  }
  return cleanText(String(it.value ?? ""));
}

function formatOf(raw: RawCell) {
  if (typeof raw.v === "string") return { kind: "text" as const };
  return classifyFormat(raw.fmt);
}

function toneToCallout(t: string): "info" | "good" | "warn" | "critical" {
  return t === "warn" ? "warn" : t === "good" ? "good" : t === "critical" ? "critical" : "info";
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/%/g, " pct ")
    .replace(/[^a-z0-9а-яё]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base || "section";
  let i = 2;
  while (used.has(id)) id = `${base}-${i++}`;
  used.add(id);
  return id;
}
