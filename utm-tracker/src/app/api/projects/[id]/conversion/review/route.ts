import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, decide, reviewQueue } from "@/lib/conversions/actions";
import { adminOnly, readJson } from "@/lib/conversions/http";
import { FLAGS } from "@/lib/conversions/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Suspicious and quarantined records with their reasons (admin only). */
export async function GET(_req: Request, props: Ctx) {
  const { id } = await props.params;
  return adminOnly(async () => ({ items: await reviewQueue(prisma, id) }));
}

const schema = z
  .object({
    source: z.enum(["sheet", "ogx"]),
    keys: z.array(z.string()).max(5000).optional(),
    flag: z.enum(FLAGS).optional(),
    decision: z.enum(["approved", "rejected"]).nullable(),
  })
  .refine((v) => v.keys?.length || v.flag, "Выберите записи или причину");

export async function POST(req: Request, props: Ctx) {
  const { id } = await props.params;
  return adminOnly(async () => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new ActionError(400, parsed.error.issues[0]?.message ?? "Неверный запрос");
    const { changed } = await decide(prisma, id, parsed.data);
    return { changed, items: await reviewQueue(prisma, id) };
  });
}
