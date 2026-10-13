import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { Report } from "@prisma/client";
import { currentActor } from "@/lib/auth";
import { slug as slugify } from "./extract";
import { parseReport } from "./parse";
import type { ReportDocument, ReportType } from "./types";
import { MAX_FILE_BYTES, ReportFileError } from "./xlsx";

/** Signed in with an approved account (any role). Changes are checked by guard() in src/lib/auth.ts. */
export async function isTeamMember(): Promise<boolean> {
  return (await currentActor())?.status === "active";
}

/** Who may open a report page. Drafts and private reports are admin-only. */
export function canView(r: Pick<Report, "status" | "visibility">, admin: boolean): boolean {
  if (admin) return true;
  return r.status === "published" && (r.visibility === "link" || r.visibility === "public");
}

/** Readable prefix + random part, so "link" reports cannot be guessed. */
export function newSlug(base: string): string {
  const head = slugify(base).replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${head || "report"}-${randomBytes(4).toString("hex")}`;
}

const XLSX_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
  "",
]);

export interface ParsedUpload {
  doc: ReportDocument;
  fileName: string;
  eventName?: string;
  projectId?: string;
}

/**
 * Read a multipart upload ("file", optional "type", "eventName") and parse it.
 * Returns a JSON error response for anything we refuse. The file itself is
 * only held in memory and never logged or stored.
 */
export async function readUpload(req: Request): Promise<ParsedUpload | NextResponse> {
  const fail = (error: string, status = 422, code?: string) => NextResponse.json({ error, code }, { status });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_FILE_BYTES + 64 * 1024) return fail(`The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`, 413, "too_large");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return fail("Attach an .xlsx file.", 400, "no_file");
  const fileName = file.name.slice(0, 200);
  if (/\.xlsm$/i.test(fileName)) return fail("Macro-enabled workbooks (.xlsm) are not accepted. Save the file as .xlsx.", 422, "macro");
  if (!/\.xlsx$/i.test(fileName)) return fail("Only .xlsx files are accepted.", 422, "not_xlsx");
  if (!XLSX_MIME.has(file.type)) return fail("Only .xlsx files are accepted.", 422, "not_xlsx");
  if (file.size > MAX_FILE_BYTES) return fail(`The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`, 413, "too_large");

  const typeField = String(form.get("type") ?? "auto");
  const type = typeField === "feedback" || typeField === "registration" ? (typeField as ReportType) : undefined;
  const eventName = String(form.get("eventName") ?? "").trim().slice(0, 120) || undefined;
  const projectId = String(form.get("projectId") ?? "").trim().slice(0, 40) || undefined;

  try {
    const doc = await parseReport(Buffer.from(await file.arrayBuffer()), { type });
    return { doc, fileName, eventName, projectId };
  } catch (e) {
    if (e instanceof ReportFileError) return fail(e.message, e.code === "too_large" ? 413 : 422, e.code);
    console.error("report parse failed:", (e as Error)?.name, (e as Error)?.message?.slice(0, 200));
    return fail("The file could not be read. Is it one of the analysis workbooks?", 422, "corrupt");
  }
}

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
