import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashIp } from "@/lib/utils";

/**
 * Rate limits for the public sign-in / sign-up endpoints, per hashed visitor
 * IP, stored in the database (serverless instances share nothing in memory).
 * - login: 10 failed attempts per 15 minutes
 * - register: 5 sign-ups per hour
 */
const RULES = {
  login: { max: 10, windowMs: 15 * 60_000, failedOnly: true },
  register: { max: 5, windowMs: 60 * 60_000, failedOnly: false },
} as const;
export type AuthKind = keyof typeof RULES;

export function requestIpHash(req: NextRequest): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  return hashIp(ip) ?? "unknown";
}

/** Minutes until the visitor may try again, or 0 when allowed. */
export async function blockedFor(kind: AuthKind, ipHash: string): Promise<number> {
  const rule = RULES[kind];
  const since = new Date(Date.now() - rule.windowMs);
  const where = { kind, ipHash, createdAt: { gte: since }, ...(rule.failedOnly ? { ok: false } : {}) };
  const n = await prisma.authAttempt.count({ where });
  if (n < rule.max) return 0;
  const oldest = await prisma.authAttempt.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const until = (oldest?.createdAt.getTime() ?? Date.now()) + rule.windowMs;
  return Math.max(1, Math.ceil((until - Date.now()) / 60_000));
}

export async function noteAttempt(kind: AuthKind, ipHash: string, ok: boolean) {
  await prisma.authAttempt.create({ data: { kind, ipHash, ok } });
  // keep the table small: drop entries older than a day now and then
  if (Math.random() < 0.02) await prisma.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
}

export const tooMany = (minutes: number) => `Too many attempts. Try again in ${minutes} min.`;
