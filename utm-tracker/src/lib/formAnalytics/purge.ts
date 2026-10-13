import { prisma } from "@/lib/db";

/** Default retention of form-analytics sessions (with their events), in days. */
export const RETENTION_DAYS = Number(process.env.ANALYTICS_RETENTION_DAYS) || 180;

/** Deletes sessions last seen more than `days` ago; their events go with them (cascade). */
export async function purgeAnalytics(days = RETENTION_DAYS) {
  const before = new Date(Date.now() - days * 86_400_000);
  const r = await prisma.analyticsSession.deleteMany({ where: { lastSeenAt: { lt: before } } });
  return { deletedSessions: r.count, before };
}
