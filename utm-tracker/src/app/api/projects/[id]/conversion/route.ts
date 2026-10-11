import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, googleStatus, saveConfig, saveManual, setOverride } from "@/lib/conversions/actions";
import { adminOnly, readJson } from "@/lib/conversions/http";
import { loadState } from "@/lib/conversions/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Current state: live automatic sources + latest manual values. */
export async function GET(_req: Request, props: Ctx) {
  const { id } = await props.params;
  return adminOnly(async () => ({ state: await loadState(prisma, id), google: googleStatus() }));
}

const int = z.number().int("Нужно целое число").min(0, "Не может быть отрицательным");
const sheetSchema = z.object({
  spreadsheetId: z.string().min(10),
  tab: z.string().min(1),
  emailCol: z.string().min(1, "Выберите колонку email"),
  timeCol: z.string().nullish(),
  nameCol: z.string().nullish(),
  phoneCol: z.string().nullish(),
  utmCol: z.string().nullish(),
});
const patchSchema = z.object({
  config: z
    .object({
      registrationSheet: sheetSchema.nullable().optional(),
      ogxCampaignId: z.string().nullable().optional(),
      countSuspicious: z.boolean().optional(),
    })
    .optional(),
  manual: z
    .object({
      showUp: int.nullable().optional(),
      aiesecOrgSignup: int.nullable().optional(),
      asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД").nullable().optional(),
      note: z.string().max(500).nullable().optional(),
    })
    .optional(),
  override: z
    .object({
      key: z.enum(["projectRegs", "regOgx"]),
      value: int.nullable(),
      reason: z.string().max(500).optional(),
    })
    .optional(),
});

export async function PATCH(req: Request, props: Ctx) {
  const { id } = await props.params;
  return adminOnly(async () => {
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ActionError(400, parsed.error.issues[0]?.message ?? "Неверный запрос");
    const { config, manual, override } = parsed.data;
    if (config) await saveConfig(prisma, id, config);
    if (manual) await saveManual(prisma, id, manual);
    if (override) await setOverride(prisma, id, override.key, override.value === null ? null : { value: override.value, reason: override.reason ?? "" });
    return { state: await loadState(prisma, id) };
  });
}
