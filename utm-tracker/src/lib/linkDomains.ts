/**
 * Short-link domains. Every domain added to the tracker's Vercel project opens
 * every /r/{slug}; a link only remembers which one it is handed out with
 * (TrackingLink.shortDomain, null = the main domain from NEXT_PUBLIC_BASE_URL).
 * Pure helpers, safe in the browser and on the server.
 */

export const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://AIESECKZ.vercel.app/" → "aieseckz.vercel.app" */
export function hostOf(urlOrHost: string): string {
  const s = urlOrHost.trim().toLowerCase();
  try {
    return new URL(/^[a-z]+:\/\//.test(s) ? s : `https://${s}`).hostname;
  } catch {
    return s.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "");
  }
}

/** The main domain's base URL (no trailing slash). */
export const mainBase = (base: string) => (base || "https://aieseckz.vercel.app").replace(/\/+$/, "");

/** Full short URL of a link, on its own domain or the main one. */
export function shortUrl(base: string, slug: string, domain?: string | null): string {
  return domain ? `https://${domain}/r/${slug}` : `${mainBase(base)}/r/${slug}`;
}

/** What to store for a picked domain: null for the main one. */
export function storedDomain(base: string, picked: string | null | undefined): string | null {
  const h = picked ? hostOf(picked) : "";
  return !h || h === hostOf(mainBase(base)) ? null : h;
}
