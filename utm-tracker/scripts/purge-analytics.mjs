// Form analytics is kept for good; nothing deletes it automatically.
// Manual clean-up, if ever needed: deletes sessions (and their events) older than N days.
//   npm run analytics:purge -- 365
import { PrismaClient } from "@prisma/client";

const days = Number(process.argv[2]);
if (!days) {
  console.error("Say how many days to keep: npm run analytics:purge -- 365");
  process.exit(1);
}
const db = new PrismaClient();
const before = new Date(Date.now() - days * 86_400_000);
const r = await db.analyticsSession.deleteMany({ where: { lastSeenAt: { lt: before } } });
console.log(`Deleted ${r.count} sessions last seen before ${before.toISOString()} (${days} days).`);
await db.$disconnect();
