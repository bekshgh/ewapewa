import type { TableSection, TableView } from "./types";

/**
 * A chart for a table the report-type config has no rule for (older reports,
 * extra blocks): picked from the table's shape at render time, so reports that
 * are already stored get it too.
 *   dates down the side      → bars per day (+ a line for a cumulative column)
 *   one measure (+ share)    → ranked bars, or a doughnut for a small part-of-whole split
 *   average scores (≤ 10)    → horizontal bars of the average + heat table
 *   several numeric columns  → heat table (diverging when the numbers are signed gaps)
 * Long lists, "Metric | Value" tables and tables without numbers stay tables.
 */
export function autoViews(t: TableSection): TableView[] {
  const fallback = t.views;
  const rows = t.rows.filter((_, i) => i !== t.totalRow);
  if (rows.length < 2 || t.columns.length < 2) return fallback;
  if (t.columns.some((c) => c.cellFormats)) return fallback; // mixed "Metric | Value" table

  const label = t.columns.findIndex((c) => c.format.kind === "text" || c.format.kind === "date");
  if (label < 0) return fallback;
  const filled = (i: number) => rows.filter((r) => typeof r[i] === "number").length >= Math.ceil(rows.length * 0.6);
  const kind = (i: number) => t.columns[i].format.kind;
  const name = (i: number) => t.columns[i].label.trim();
  const nums = t.columns.map((_, i) => i).filter((i) => i !== label && (kind(i) === "number" || kind(i) === "percent") && filled(i));
  if (!nums.length) return fallback;

  const helper = (i: number) => /^(#|rank|day #)$|cumul|running|накоп/i.test(name(i));
  const plain = nums.filter((i) => !helper(i));
  const counts = plain.filter((i) => kind(i) === "number" && !t.columns[i].format.signed);
  const shares = plain.filter((i) => kind(i) === "percent" && !t.columns[i].format.signed);

  // a day-by-day log
  if (kind(label) === "date" && rows.length >= 3) {
    const main = counts[0] ?? plain[0] ?? nums[0];
    const views: TableView[] = [{ type: "bars", label, values: [main] }];
    const cum = nums.find((i) => /cumul|running|накоп/i.test(name(i)) && kind(i) === "number");
    if (cum !== undefined) views.push({ type: "line", label, values: [cum] });
    return [...views, { type: "table" }];
  }
  if (rows.length > 30 || !plain.length) return fallback;

  // one measure, maybe with its share
  if (counts.length + shares.length === plain.length && counts.length <= 1 && shares.length <= 1) {
    const value = counts[0] ?? shares[0];
    const share = counts.length && shares.length ? shares[0] : undefined;
    const shareSum = share === undefined ? 0 : rows.reduce((s, r) => s + (typeof r[share] === "number" ? (r[share] as number) : 0), 0);
    if (counts.length && share !== undefined && rows.length <= 6 && Math.abs(shareSum - 1) < 0.03) {
      return [{ type: "doughnut", label, value: counts[0] }, { type: "table" }];
    }
    return [{ type: "ranked", label, value, ...(share !== undefined ? { share } : {}) }];
  }

  // average scores (out of 5 or 10) read best as bars, with the full table under them
  const avg = plain.find((i) => /^(all\s+)?(avg|mean|average|score)(?![a-z])|score\s*\/\s*10/i.test(name(i)) && kind(i) === "number"
    && rows.every((r) => typeof r[i] !== "number" || ((r[i] as number) >= 0 && (r[i] as number) <= 10)));
  const from = Math.min(...plain);
  if (avg !== undefined && rows.length <= 15) {
    return [{ type: "bars", label, values: [avg], horizontal: true }, { type: "heat", from, to: Math.max(...plain) }];
  }

  // a matrix of numbers
  const to = Math.max(...plain);
  const diverging = plain.some((i) => t.columns[i].format.signed) && plain.every((i) => t.columns[i].format.signed || /gap|Δ|diff|vs/i.test(name(i)));
  return [{ type: "heat", from, to, ...(diverging ? { diverging: true } : {}) }];
}

/** The views to draw: the config's own, or a picked chart when it left the table plain. */
export function viewsFor(t: TableSection): TableView[] {
  const plain = t.views.length === 1 && t.views[0].type === "table" && !t.views[0].searchable;
  return plain ? autoViews(t) : t.views;
}
