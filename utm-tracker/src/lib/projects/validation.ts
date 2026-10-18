import { z } from "zod";
import { NAME_RULE, normalizeProjectName } from "@/lib/naming";

/** "<Project> F'26" / "<Project> S'26", stored in its canonical spelling. */
export const projectName = z
  .string()
  .trim()
  .max(120)
  .refine((v) => normalizeProjectName(v) !== null, NAME_RULE)
  .transform((v) => normalizeProjectName(v)!);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const text = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));

export const projectSchema = z.object({
  name: projectName,
  typeKey: z.string().trim().min(1).max(40),
  format: z.enum(["offline", "online", "hybrid"]).nullable().optional(),
  status: z.enum(["planned", "registration", "done", "archived"]).default("planned"),
  startDate: date,
  endDate: date,
  city: text(80),
  venue: text(120),
  ownerTeam: text(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const projectPatchSchema = projectSchema.partial();

/** Creating a project also creates its campaign, unless the caller says not to (past events from report files). */
export const projectCreateSchema = projectSchema.extend({ campaign: z.boolean().default(true) });

/** The first field error, readable: the naming rule rather than "Validation failed". */
export const validationError = (e: z.ZodError) => {
  const f = e.flatten().fieldErrors as Record<string, string[] | undefined>;
  return f.name?.[0] ?? "Validation failed";
};

export const projectTypeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  key: z.string().trim().regex(/^[a-z0-9_]{2,40}$/).optional(),
});

export const savedViewSchema = z.object({
  name: z.string().trim().min(1).max(60),
  query: z.string().max(2000),
});

/** "2026-08-22" → Date; null clears the field; undefined leaves it alone. */
export const toDate = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00Z`) : v === null ? null : undefined);
