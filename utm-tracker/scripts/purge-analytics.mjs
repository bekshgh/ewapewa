// Deletes form-analytics sessions (and their events) older than N days.
//   npm run analytics:purge            → ANALYTICS_RETENTION_DAYS or 180
//   npm run analytics:purge -- 90
import { PrismaClient } from "@prisma/client";

const days = Number(process.argv[2]) || Number(process.env.ANALYTICS_RETENTION_DAYS) || 180;
const db = new PrismaClient();
const before = new Date(Date.now() - days * 86_400_000);
const r = await db.analyticsSession.deleteMany({ where: { lastSeenAt: { lt: before } } });
console.log(`Deleted ${r.count} sessions last seen before ${before.toISOString()} (${days} days).`);
await db.$disconnect();
