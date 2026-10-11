import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recomputeAll } from "@/lib/projects/recompute";

/**
 * Copies everything from a previous deployment of this tracker (its own
 * Postgres) into this one. The old database is only read.
 *
 * - Works across schema versions: only columns both sides have are copied, and
 *   tables the old side lacks are skipped. An old `FormSubmit` table (removed by
 *   migration 0003) is turned into leads the same way that migration did.
 * - Safe to run again: rows that already exist are skipped (ON CONFLICT DO
 *   NOTHING), so a run cut short by a timeout simply continues.
 * - A row that matches an existing one by its natural key (link slug, project
 *   slug, report slug, project type key, user email) is merged into it: its
 *   children (clicks, leads, reports...) are attached to the existing row.
 */

type Spec = {
  table: string;
  /** Natural unique key: an old row with the same value is merged into the existing one. */
  key?: string;
  /** FK column → parent table. A missing parent nulls the column, or drops the row if `required`. */
  fks?: Record<string, string>;
  required?: string[];
  /** Order rows so pagination is stable. */
  order?: string;
};

// Parents before children.
const SPECS: Spec[] = [
  { table: "User", key: "email" },
  { table: "Campaign", fks: { userId: "User" } },
  { table: "TrackingLink", key: "slug", fks: { userId: "User", campaignId: "Campaign" } },
  { table: "ClickEvent", fks: { trackingLinkId: "TrackingLink" }, required: ["trackingLinkId"] },
  { table: "Lead", fks: { trackingLinkId: "TrackingLink", clickEventId: "ClickEvent" } },
  { table: "WebhookLog" },
  { table: "AppSetting", order: "key" },
  { table: "ProjectType", key: "key" },
  { table: "Project", key: "slug", fks: { typeId: "ProjectType" }, required: ["typeId"] },
  { table: "ProjectMetrics", fks: { projectId: "Project" }, required: ["projectId"], order: "projectId" },
  { table: "Report", key: "slug", fks: { projectId: "Project" } },
  { table: "ThemeMapping", fks: { reportId: "Report" }, required: ["reportId"] },
  { table: "SavedView" },
];

const BATCH = 1000;

export type TableResult = { table: string; found: number; imported: number; merged: number };
export type ImportResult = { tables: TableResult[]; formSubmitsAsLeads?: number };

export function isPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\/\S+$/.test(url.trim());
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

async function columns(db: PrismaClient, table: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
    table,
  );
  return rows.map((r) => r.column_name);
}

async function count(db: PrismaClient, table: string): Promise<number> {
  const [row] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${q(table)}`);
  return row.n;
}

/** Old rows as plain JSON (timestamps, enums, arrays and jsonb survive the round trip). */
async function readBatch(db: PrismaClient, table: string, cols: string[], order: string, offset: number) {
  const list = cols.map(q).join(", ");
  const rows = await db.$queryRawUnsafe<{ r: Record<string, unknown> }[]>(
    `SELECT row_to_json(t) AS r FROM (SELECT ${list} FROM ${q(table)} ORDER BY ${q(order)} LIMIT ${BATCH} OFFSET ${offset}) t`,
  );
  return rows.map((x) => x.r);
}

/**
 * Inserts rows into this database. FK columns are checked against the parent
 * table here, in SQL, so a missing parent never aborts the batch.
 */
async function insert(table: string, cols: string[], spec: Spec, rows: Record<string, unknown>[]): Promise<number> {
  if (!rows.length) return 0;
  const select = cols
    .map((c) => {
      const parent = spec.fks?.[c];
      return parent ? `(SELECT p."id" FROM ${q(parent)} p WHERE p."id" = r.${q(c)})` : `r.${q(c)}`;
    })
    .join(", ");
  const where = (spec.required ?? [])
    .map((c) => `EXISTS (SELECT 1 FROM ${q(spec.fks![c])} p WHERE p."id" = r.${q(c)})`)
    .join(" AND ");
  const [row] = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `WITH ins AS (
       INSERT INTO ${q(table)} (${cols.map(q).join(", ")})
       SELECT ${select} FROM json_populate_recordset(NULL::${q(table)}, $1::json) r
       ${where ? `WHERE ${where}` : ""}
       ON CONFLICT DO NOTHING
       RETURNING 1
     ) SELECT count(*)::int AS n FROM ins`,
    JSON.stringify(rows),
  );
  return row.n;
}

/** Old FormSubmit rows → leads, exactly as migration 0003 converted them. */
function formSubmitToLead(fs: Record<string, unknown>): Record<string, unknown> {
  return {
    id: fs.id,
    trackingLinkId: fs.trackingLinkId,
    clickEventId: fs.clickEventId,
    clickId: fs.clickId,
    formName: fs.formName ?? null,
    pageUrl: fs.pageUrl ?? null,
    submittedAt: fs.submittedAt,
    sourcePayload: { _source: "form_submit_migration", click_id: fs.clickId },
    attributionStatus: "exact",
    dedupeKey: `ck:${fs.clickId}`,
    createdAt: new Date().toISOString(),
  };
}

function withOldDb<T>(url: string, fn: (old: PrismaClient) => Promise<T>): Promise<T> {
  const old = new PrismaClient({ datasourceUrl: url.trim() });
  return fn(old).finally(() => old.$disconnect());
}

/** Row counts on the old side, to show before importing. */
export function inspectLegacy(url: string): Promise<{ table: string; rows: number }[]> {
  return withOldDb(url, async (old) => {
    const out: { table: string; rows: number }[] = [];
    for (const { table } of [...SPECS, { table: "FormSubmit" }]) {
      if ((await columns(old, table)).length) out.push({ table, rows: await count(old, table) });
    }
    return out;
  });
}

export function importLegacy(url: string): Promise<ImportResult> {
  return withOldDb(url, async (old) => {
    // old id → id of the existing row it was merged into, per table
    const remap: Record<string, Map<string, string>> = {};
    const tables: TableResult[] = [];
    let formSubmitsAsLeads: number | undefined;

    for (const spec of SPECS) {
      const oldCols = await columns(old, spec.table);
      if (!oldCols.length) continue;
      const newCols = new Set(await columns(prisma, spec.table));
      const cols = oldCols.filter((c) => newCols.has(c));
      const order = spec.order ?? "id";
      const result: TableResult = { table: spec.table, found: 0, imported: 0, merged: 0 };
      const keys: { id: string; key: string }[] = [];

      for (let offset = 0; ; offset += BATCH) {
        const rows = await readBatch(old, spec.table, cols, order, offset);
        if (!rows.length) break;
        for (const r of rows) {
          for (const [col, parent] of Object.entries(spec.fks ?? {})) {
            const to = typeof r[col] === "string" ? remap[parent]?.get(r[col] as string) : undefined;
            if (to) r[col] = to;
          }
          if (spec.key && r[spec.key] != null) keys.push({ id: String(r.id), key: String(r[spec.key]) });
        }
        result.found += rows.length;
        result.imported += await insert(spec.table, cols, spec, rows);
        if (rows.length < BATCH) break;
      }

      if (spec.key && keys.length) {
        // Rows skipped because the natural key already exists here: send their children there.
        const existing = await prisma.$queryRawUnsafe<{ id: string; key: string }[]>(
          `SELECT "id", ${q(spec.key)}::text AS key FROM ${q(spec.table)} WHERE ${q(spec.key)}::text = ANY($1::text[])`,
          keys.map((k) => k.key),
        );
        const byKey = new Map(existing.map((e) => [e.key, e.id]));
        const map = new Map<string, string>();
        for (const k of keys) {
          const here = byKey.get(k.key);
          if (here && here !== k.id) map.set(k.id, here);
        }
        remap[spec.table] = map;
        result.merged = map.size;
      }
      tables.push(result);

      if (spec.table === "Lead") {
        const fsCols = await columns(old, "FormSubmit");
        if (fsCols.length) {
          const leadCols = Object.keys(formSubmitToLead({}));
          const leadSpec = SPECS.find((s) => s.table === "Lead")!;
          formSubmitsAsLeads = 0;
          for (let offset = 0; ; offset += BATCH) {
            const rows = await readBatch(old, "FormSubmit", fsCols, "id", offset);
            if (!rows.length) break;
            const leads = rows.map((r) => {
              const lead = formSubmitToLead(r);
              for (const col of ["trackingLinkId", "clickEventId"] as const) {
                const parent = leadSpec.fks![col];
                const to = remap[parent]?.get(lead[col] as string);
                if (to) lead[col] = to;
              }
              return lead;
            });
            formSubmitsAsLeads += await insert("Lead", leadCols, leadSpec, leads);
            if (rows.length < BATCH) break;
          }
        }
      }
    }

    // Imported projects may carry metrics from an older formula.
    if (tables.some((t) => t.table === "Project" && t.imported > 0)) {
      await recomputeAll(prisma, true);
    }
    return { tables, formSubmitsAsLeads };
  });
}
