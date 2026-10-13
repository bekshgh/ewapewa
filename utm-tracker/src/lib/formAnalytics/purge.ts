import { prisma } from "@/lib/db";

/**
 * Form analytics is kept for good (it is anonymous and useful for future
 * projects); nothing deletes it automatically. This is for a manual clean-up.
 * Deletes sessions last seen more than `days` ago; their events go with them.
 */
export async function purgeAnalytics(days: number) {
  const before = new Date(Date.now() - days * 86_400_000);
  const r = await prisma.analyticsSession.deleteMany({ where: { lastSeenAt: { lt: before } } });
  return { deletedSessions: r.count, before };
}
