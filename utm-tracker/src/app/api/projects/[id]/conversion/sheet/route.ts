import { z } from "zod";
import { ActionError, sheetPreview } from "@/lib/conversions/actions";
import { adminOnly, readJson } from "@/lib/conversions/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ link: z.string().min(1), tab: z.string().nullish() });

/** Check access to a Google Sheet and preview its columns (admin only: samples may contain personal data). */
export async function POST(req: Request) {
  return adminOnly(async () => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new ActionError(400, "Вставьте ссылку на таблицу");
    return sheetPreview(parsed.data.link, parsed.data.tab ?? null);
  });
}
