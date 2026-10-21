import { prisma } from "@/lib/db";
import { formatProjectName, normalizeProjectName, termOf, type Term } from "@/lib/naming";
import { parseCampaignName } from "@/lib/projectGroups";

/**
 * Projects and campaigns named before the "<Project> F'26" rule, with a
 * suggested name where the term can be worked out: a campaign's season
 * ("spring 2026") or its utm value ("icy_s26"), a project's start date.
 */
export interface OldName {
  kind: "project" | "campaign";
  id: string;
  name: string;
  suggested: string | null;
}

function termFromSeason(season: string | null | undefined): Term | null {
  const m = /\b(fall|autumn|spring)\b\D*(20\d{2}|\d{2})\b/i.exec(season ?? "");
  return m ? (`${/spring/i.test(m[1]) ? "S" : "F"}'${m[2].slice(-2)}` as Term) : null;
}

function termFromSlug(text: string): Term | null {
  const s = parseCampaignName(text).season; // "s26", "f26", "fall2026"…
  const m = /^(f|s|fa|sp|fall|spring|autumn)(\d{2}|20\d{2})$/.exec(s);
  return m ? (`${/^(s|sp|spring)$/.test(m[1]) ? "S" : "F"}'${m[2].slice(-2)}` as Term) : null;
}

/** "ICY Spring 2026" → "ICY": drop words that only restate the term. */
const baseOf = (name: string) =>
  name.replace(/\b(fall|autumn|spring)\b\s*['’]?\s*(20\d{2}|\d{2})?\b/gi, "").replace(/\b[fs]['’]?\d{2}\b/gi, "").replace(/\s+/g, " ").trim() || name.trim();

export async function oldNames(): Promise<OldName[]> {
  const [projects, campaigns] = await Promise.all([
    prisma.project.findMany({ where: { demo: false }, select: { id: true, name: true, startDate: true }, orderBy: { createdAt: "desc" } }),
    prisma.campaign.findMany({ select: { id: true, name: true, label: true, season: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const out: OldName[] = [];
  for (const p of projects) {
    if (normalizeProjectName(p.name) === p.name) continue;
    const fixed = normalizeProjectName(p.name);
    const term = termFromSlug(p.name) ?? (p.startDate ? termOf(p.startDate) : null);
    out.push({ kind: "project", id: p.id, name: p.name, suggested: fixed ?? (term ? formatProjectName(baseOf(p.name), term) : null) });
  }
  for (const c of campaigns) {
    const name = c.label || c.name;
    if (normalizeProjectName(name) === name) continue;
    const fixed = normalizeProjectName(name);
    const term = termFromSeason(c.season) ?? termFromSlug(c.label ?? "") ?? termFromSlug(c.name);
    out.push({ kind: "campaign", id: c.id, name, suggested: fixed ?? (term ? formatProjectName(baseOf(name), term) : null) });
  }
  return out;
}
