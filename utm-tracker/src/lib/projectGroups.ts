/**
 * A project and its campaigns, grouped by name: "TopTalents Sprint F'26",
 * "TopTalents Sprint EwA2oGX" and "TopTalents Sprint EwA2MXP" are one
 * project. The campaign without an EwA2… tag is the project's own campaign
 * (its leads are registrations for the project); EwA2oGX / EwA2MXP campaigns
 * are the exchange programmes people go on to apply for.
 * Pure helpers, safe to use in the browser and on the server.
 */

export interface GroupCampaign {
  id: string;
  name: string;
  label: string | null;
  createdAt: Date | string;
}

export interface CampaignRole {
  /** "project" for the project's own campaign, else the programme, e.g. "oGX". */
  kind: "project" | "programme";
  /** Shown in the UI: "Project", "EwA2oGX", "EwA2MXP". */
  title: string;
}

export interface ProjectGroup<C extends GroupCampaign = GroupCampaign> {
  /** URL-safe id, e.g. "toptalentssprint-f26". */
  key: string;
  /** Human name, e.g. "TopTalents Sprint F'26". */
  title: string;
  /** Project campaign(s) first, then programmes in a fixed order. */
  campaigns: (C & { role: CampaignRole })[];
}

const PROGRAMME_RE = /ewa2([a-z]+)/;
const SEASON_RE = /^(?:f|s|w|fa|sp|su|fall|spring|summer|winter|autumn)?\d{2,4}$/;
const PROGRAMME_TITLE: Record<string, string> = { ogx: "EwA2oGX", mxp: "EwA2MXP", igv: "EwA2iGV", igt: "EwA2iGT" };
const PROGRAMME_ORDER = ["ogx", "mxp"];

/** Lower-case latin words, accents removed, apostrophes dropped: "Özge F'26" → ["ozge", "f26"]. */
function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .split(/[^a-z0-9а-яё]+/)
    .filter(Boolean);
}

export interface ParsedName {
  /** Project part of the name, e.g. "toptalentssprint". */
  base: string;
  /** "f26" when the name carries a season, else "". */
  season: string;
  /** "ogx", "mxp"…; "" for the project's own campaign. */
  programme: string;
}

export function parseCampaignName(text: string): ParsedName {
  let season = "";
  let programme = "";
  const base: string[] = [];
  for (const w of words(text)) {
    const m = PROGRAMME_RE.exec(w);
    if (m) {
      programme = m[1];
      const rest = w.slice(0, m.index); // "ttsewa2ogx" keeps "tts"
      if (rest) base.push(rest);
    } else if (SEASON_RE.test(w)) season = w;
    else base.push(w);
  }
  return { base: base.join(""), season, programme };
}

/** Both the label and the utm name count: whichever carries more. */
function parse(c: GroupCampaign): ParsedName {
  const a = parseCampaignName(c.label ?? "");
  const b = parseCampaignName(c.name);
  return {
    base: a.base || b.base,
    season: a.season || b.season,
    programme: a.programme || b.programme,
  };
}

export function roleOf(c: GroupCampaign): CampaignRole {
  const p = parse(c).programme;
  if (!p) return { kind: "project", title: "Project" };
  return { kind: "programme", title: PROGRAMME_TITLE[p] ?? `EwA2${p.toUpperCase()}` };
}

const time = (d: Date | string) => new Date(d).getTime();

/**
 * Groups campaigns into projects by name. A campaign whose name has no
 * season joins the most recent group of the same project; campaigns of
 * different seasons stay apart.
 */
export function groupCampaigns<C extends GroupCampaign>(campaigns: C[]): ProjectGroup<C>[] {
  const parsed = campaigns.map((c) => ({ c, p: parse(c) }));
  const groups = new Map<string, { base: string; season: string; items: typeof parsed }>();
  const id = (base: string, season: string) => (season ? `${base}-${season}` : base);

  // Seasoned campaigns first: they fix which seasons exist.
  for (const x of parsed.filter((x) => x.p.season)) {
    const k = id(x.p.base, x.p.season);
    const g = groups.get(k) ?? { base: x.p.base, season: x.p.season, items: [] };
    g.items.push(x);
    groups.set(k, g);
  }
  for (const x of parsed.filter((x) => !x.p.season)) {
    const same = [...groups.entries()].filter(([, g]) => g.base === x.p.base);
    const latest = same.sort((a, b) => newest(b[1].items) - newest(a[1].items))[0];
    const k = latest ? latest[0] : id(x.p.base, "");
    const g = groups.get(k) ?? { base: x.p.base, season: "", items: [] };
    g.items.push(x);
    groups.set(k, g);
  }

  return [...groups.entries()]
    .map(([key, g]) => {
      const items = g.items
        .map(({ c }) => ({ ...c, role: roleOf(c) }))
        .sort((a, b) => rank(a) - rank(b) || time(b.createdAt) - time(a.createdAt));
      const lead = items.find((c) => c.role.kind === "project") ?? items[0];
      const title =
        lead.role.kind === "project"
          ? lead.label || lead.name
          : (lead.label || lead.name).replace(/\s*ewa2[a-z]+\s*/i, " ").trim() || lead.name;
      return { key: key || "project", title, campaigns: items };
    })
    .sort((a, b) => newest(b.campaigns.map((c) => ({ c }))) - newest(a.campaigns.map((c) => ({ c }))));
}

function newest(items: { c: GroupCampaign }[]) {
  return Math.max(...items.map((x) => time(x.c.createdAt)));
}

function rank(c: GroupCampaign & { role: CampaignRole }) {
  if (c.role.kind === "project") return 0;
  const i = PROGRAMME_ORDER.indexOf(parse(c).programme);
  return i < 0 ? 1 + PROGRAMME_ORDER.length : 1 + i;
}

/** Same person across forms: lower-case e-mail, or the last 10 digits of the phone. */
export function personKeys(p: { email?: string | null; phone?: string | null }): string[] {
  const keys: string[] = [];
  const email = p.email?.trim().toLowerCase();
  if (email && email.includes("@")) keys.push(`e:${email}`);
  const digits = (p.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) keys.push(`p:${digits.slice(-10)}`);
  return keys;
}
