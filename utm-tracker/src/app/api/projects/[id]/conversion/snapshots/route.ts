import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, createSnapshot, listSnapshots } from "@/lib/conversions/actions";
import { adminOnly, readJson } from "@/lib/conversions/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, props: Ctx) {
  const { id } = await props.params;
  return adminOnly(async () => ({ snapshots: await listSnapshots(prisma, id) }));
}

const schema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().max(500).nullish(),
});

/** Freeze the current state into the history. Snapshots are never edited afterwards. */
export async function POST(req: Request, props: Ctx) {
  const { id } = await props.params;
  return adminOnly(async () => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new ActionError(400, "Неверная дата");
    await createSnapshot(prisma, id, parsed.data);
    return { snapshots: await listSnapshots(prisma, id) };
  });
}
