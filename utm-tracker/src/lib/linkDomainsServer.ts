import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DOMAIN_RE, hostOf, mainBase } from "@/lib/linkDomains";

const KEY = "links.domains";
export const BASE = mainBase(process.env.NEXT_PUBLIC_BASE_URL || "");

/** The main domain first, then the extra ones added in Settings. */
export async function linkDomains(): Promise<string[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const extra = z.array(z.string()).safeParse(row?.value ?? []);
  const main = hostOf(BASE);
  return [main, ...(extra.success ? extra.data : []).filter((d) => d !== main)];
}

export const domainListSchema = z
  .array(z.string().transform(hostOf).refine((d) => DOMAIN_RE.test(d), "Enter a domain like zimran-aiesec.vercel.app"))
  .max(20);

export async function saveLinkDomains(domains: string[]) {
  const main = hostOf(BASE);
  const list = [...new Set(domains.filter((d) => d !== main))];
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: list as unknown as Prisma.InputJsonValue },
    update: { value: list as unknown as Prisma.InputJsonValue },
  });
  return [main, ...list];
}

/** A picked domain, checked against the list: null for the main one; throws for an unknown one. */
export async function checkedDomain(picked: string | null | undefined): Promise<string | null> {
  if (!picked) return null;
  const h = hostOf(picked);
  const all = await linkDomains();
  if (h === all[0]) return null;
  if (!all.includes(h)) throw new Error(`"${h}" is not one of the tracker's domains (Settings → Short link domains).`);
  return h;
}
