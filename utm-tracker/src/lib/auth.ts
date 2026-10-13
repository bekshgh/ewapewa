import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { OWNER, SESSION_COOKIE, readSessionToken } from "@/lib/session";
import { canEditFolder, isAdmin, type Actor } from "@/lib/permissions";
import { groupCampaigns } from "@/lib/projectGroups";

/**
 * The signed-in person, read fresh from the database on every request, so a
 * changed role or a disabled account takes effect at once. The AUTH_EMAIL
 * login is the owner: an admin that always exists.
 */
export const currentActor = cache(async (): Promise<Actor | null> => {
  const subject = await readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!subject) return null;
  if (subject === OWNER) {
    return {
      id: OWNER, owner: true, email: process.env.AUTH_EMAIL ?? "", name: "Owner", position: null,
      role: "admin", status: "active", projectKeys: [],
    };
  }
  const u = await prisma.user.findUnique({ where: { id: subject } });
  if (!u) return null;
  return {
    id: u.id, owner: false, email: u.email, name: u.name, position: u.position,
    role: u.role, status: u.status, projectKeys: u.projectKeys,
  };
});

const deny = (status: 401 | 403, error: string) => NextResponse.json({ error }, { status });

/**
 * For route handlers: `const a = await guard("admin"); if (a instanceof NextResponse) return a;`
 *   "active" — any approved account (reading)
 *   "admin"  — admins only
 */
export async function guard(level: "active" | "admin"): Promise<Actor | NextResponse> {
  const a = await currentActor();
  if (!a) return deny(401, "Sign in first");
  if (a.status !== "active") return deny(403, a.status === "pending" ? "Your account is waiting for an admin's approval" : "Your account is disabled");
  if (level === "admin" && !isAdmin(a)) return deny(403, "Only admins can do this");
  return a;
}

export const forbidden = (what = "this project") => deny(403, `You can only change ${what} if it is one of your projects`);

async function campaignFolders(extra?: { name: string; label: string | null }) {
  const campaigns = await prisma.campaign.findMany({ select: { id: true, name: true, label: true, createdAt: true } });
  const all = extra ? [...campaigns, { id: "__new", ...extra, createdAt: new Date() }] : campaigns;
  const folderOf = new Map<string, string>();
  for (const g of groupCampaigns(all)) for (const c of g.campaigns) folderOf.set(c.id, g.key);
  return folderOf;
}

/** May edit this campaign (and its links): admins, or the manager of its project folder. */
export async function canEditCampaign(a: Actor | null, campaignId: string | null | undefined): Promise<boolean> {
  if (isAdmin(a)) return true;
  if (!a || !campaignId) return false;
  return canEditFolder(a, (await campaignFolders()).get(campaignId));
}

/** May create a campaign with this name: it has to land in one of the manager's folders. */
export async function canCreateCampaign(a: Actor, c: { name: string; label?: string | null }): Promise<boolean> {
  if (isAdmin(a)) return true;
  return canEditFolder(a, (await campaignFolders({ name: c.name, label: c.label ?? null })).get("__new"));
}

/** A link belongs to the campaign it is attached to, or else the one its utm_campaign names. */
export async function linkCampaignId(l: { campaignId?: string | null; utmCampaign?: string | null }): Promise<string | null> {
  if (l.campaignId) return l.campaignId;
  if (!l.utmCampaign) return null;
  return (await prisma.campaign.findFirst({ where: { name: l.utmCampaign }, select: { id: true } }))?.id ?? null;
}

export async function canEditLink(a: Actor, l: { campaignId?: string | null; utmCampaign?: string | null }): Promise<boolean> {
  if (isAdmin(a)) return true;
  return canEditCampaign(a, await linkCampaignId(l));
}

/** Campaign ids this person may edit (all of them for admins). */
export async function editableCampaignIds(a: Actor | null): Promise<Set<string>> {
  if (!a || a.status !== "active" || a.role === "viewer") return new Set();
  const folderOf = await campaignFolders();
  return new Set([...folderOf.entries()].filter(([, key]) => isAdmin(a) || canEditFolder(a, key)).map(([id]) => id));
}
