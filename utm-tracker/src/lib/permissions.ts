/**
 * Who may do what. Pure rules, safe to use in the browser and on the server;
 * the server enforces them in src/lib/auth.ts.
 *
 *   admin   — everything, incl. users, data and settings
 *   manager — project manager: edits the campaigns, links and numbers of the
 *             project folders assigned to them; sees everything else
 *   viewer  — sees everything, edits nothing
 */

export type Role = "admin" | "manager" | "viewer";
export type Status = "pending" | "active" | "disabled";

export interface Actor {
  /** User id, or "owner" for the AUTH_EMAIL login. */
  id: string;
  owner: boolean;
  email: string;
  name: string | null;
  position: string | null;
  role: Role;
  status: Status;
  /** Project folder keys a manager edits (see projectGroups.ts). */
  projectKeys: string[];
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Project manager",
  viewer: "Viewer",
};

export const isActive = (a: Actor | null): boolean => !!a && a.status === "active";
export const isAdmin = (a: Actor | null): boolean => !!a && a.status === "active" && a.role === "admin";

/** May edit this project folder's numbers, campaigns and links. */
export function canEditFolder(a: Actor | null, folderKey: string | null | undefined): boolean {
  if (!a || a.status !== "active") return false;
  if (a.role === "admin") return true;
  return a.role === "manager" && !!folderKey && a.projectKeys.includes(folderKey);
}

/** Managers and admins can create campaigns (managers only inside their folders). */
export const canCreateCampaigns = (a: Actor | null): boolean =>
  !!a && a.status === "active" && (a.role === "admin" || (a.role === "manager" && a.projectKeys.length > 0));
