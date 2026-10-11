import { prisma } from "@/lib/db";
import { refreshFromSheet } from "@/lib/conversions/actions";
import { adminOnly } from "@/lib/conversions/http";
import { loadState } from "@/lib/conversions/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Re-read the registration sheet (at most every 30 s; a quicker repeat returns the cached result). */
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return adminOnly(async () => {
    const { cached } = await refreshFromSheet(prisma, id);
    return { cached, state: await loadState(prisma, id) };
  });
}
