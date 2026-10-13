/**
 * The headline numbers of a project folder. Registrations come from the
 * tracker but can be corrected by hand; show-up and AIESEC.org sign-ups are
 * only known to the team, so they are always typed in.
 * Pure helpers, safe to use in the browser and on the server.
 */
import { z } from "zod";

const count = z.number().int().min(0).max(10_000_000);

/** What the team typed in. A missing number means "use the tracker's". */
export const manualNumbersSchema = z.object({
  projectRegs: count.optional(),
  showUp: count.optional(),
  signups: count.optional(),
  /** Programme registrations by campaign id. */
  programmes: z.record(z.string(), count).optional(),
});
export type ManualNumbers = z.infer<typeof manualNumbersSchema>;

export interface NumberValue {
  value: number | null;
  /** The tracker's own count, when it has one. */
  tracked: number | null;
  manual: boolean;
}

export interface FolderNumbers {
  projectRegs: NumberValue;
  showUp: NumberValue;
  signups: NumberValue;
  programmes: { id: string; title: string; regs: NumberValue }[];
}

const pick = (manual: number | undefined, tracked: number | null): NumberValue =>
  manual !== undefined ? { value: manual, tracked, manual: true } : { value: tracked, tracked, manual: false };

export function folderNumbers(
  tracked: { projectRegs: number | null; programmes: { id: string; title: string; leads: number }[] },
  manual: ManualNumbers,
): FolderNumbers {
  return {
    projectRegs: pick(manual.projectRegs, tracked.projectRegs),
    showUp: pick(manual.showUp, null),
    signups: pick(manual.signups, null),
    programmes: tracked.programmes.map((p) => ({ id: p.id, title: p.title, regs: pick(manual.programmes?.[p.id], p.leads) })),
  };
}

export interface Conversion {
  label: string;
  num: number | null;
  den: number | null;
  /** %, or null when either number is missing or the base is 0. */
  pct: number | null;
}

const ratio = (label: string, num: number | null, den: number | null): Conversion => ({
  label,
  num,
  den,
  pct: num !== null && den ? (num / den) * 100 : null,
});

/** Each programme ÷ project registrations and ÷ show-up, then sign-ups the same way. */
export function conversions(n: FolderNumbers): Conversion[] {
  const short = (t: string) => t.replace(/^EwA2/, "");
  return [
    ...n.programmes.flatMap((p) => [
      ratio(`${short(p.title)} regs ÷ project regs`, p.regs.value, n.projectRegs.value),
      ratio(`${short(p.title)} regs ÷ project show-up`, p.regs.value, n.showUp.value),
    ]),
    ratio("AIESEC.org sign-ups ÷ project regs", n.signups.value, n.projectRegs.value),
    ratio("AIESEC.org sign-ups ÷ project show-up", n.signups.value, n.showUp.value),
  ];
}
