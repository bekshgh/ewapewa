import type { ReportFilter, SliceBy } from "@/lib/formAnalytics/report";

export type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Report filters from the page's query string (also used by the CSV export). */
export function parseFilter(formId: string, sp: SP): ReportFilter {
  const day = (v?: string, end = false) => {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
    const d = new Date(`${v}T00:00:00+05:00`); // Almaty days
    if (end) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  };
  return {
    formId,
    from: day(one(sp.from)),
    to: day(one(sp.to), true),
    utmSource: one(sp.source),
    utmCampaign: one(sp.campaign),
    device: one(sp.device),
    lang: one(sp.lang),
    city: one(sp.city),
    includeTest: one(sp.test) === "1",
  };
}

export const SLICES: { by: SliceBy; title: string }[] = [
  { by: "source", title: "Source (utm_source)" },
  { by: "campaign", title: "Campaign (utm_campaign)" },
  { by: "device", title: "Device" },
  { by: "lang", title: "Page language" },
  { by: "city", title: "City (answer)" },
  { by: "relocation", title: "Ready to relocate (answer)" },
];

export function pickSlice(v?: string | string[]): SliceBy {
  const s = one(v);
  return SLICES.some((x) => x.by === s) ? (s as SliceBy) : "source";
}

/** "1 m 05 s", "12 s", "—" */
export function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, "0")} s`;
}

/** Field names as people know them on the form. */
export const FIELD_LABEL: Record<string, string> = {
  name: "Full name", email: "Email", phone: "Phone", telegram: "Telegram", city: "City", age: "Age",
  status: "Background", course: "Year of study", university: "Field of study", universityName: "University",
  english: "English level", relocation: "Ready to relocate", confirmRelocation: "Relocation confirmation", confirmData: "Data consent",
};
export const fieldLabel = (k: string) => FIELD_LABEL[k] ?? k;
