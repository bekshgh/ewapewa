import { prisma } from "@/lib/db";
import { ActionError, uploadRegistration } from "@/lib/conversions/actions";
import { adminOnly } from "@/lib/conversions/http";
import { loadState } from "@/lib/conversions/state";
import { MAX_FILE_BYTES } from "@/lib/reports/xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Upload the registration table as CSV/XLSX. Without `emailCol` it only
 * previews the columns; with it the file is processed. The file itself is never stored.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return adminOnly(async () => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new ActionError(400, "Выберите файл");
    if (file.size > MAX_FILE_BYTES) throw new ActionError(413, "Файл больше 4 МБ");
    const field = (k: string) => {
      const v = form!.get(k);
      return typeof v === "string" && v.trim() ? v : null;
    };
    const emailCol = field("emailCol");
    const columns = emailCol
      ? { emailCol, timeCol: field("timeCol"), nameCol: field("nameCol"), phoneCol: field("phoneCol"), utmCol: field("utmCol") }
      : null;
    const result = await uploadRegistration(prisma, id, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, columns, field("tab"));
    return "preview" in result ? result : { state: await loadState(prisma, id) };
  });
}
