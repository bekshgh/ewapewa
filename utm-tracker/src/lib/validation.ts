import { z } from "zod";
import { projectName } from "@/lib/projects/validation";

const slugRegex = /^[a-zA-Z0-9_-]+$/;

export const createLinkSchema = z.object({
  name: z.string().min(1, "Add a short description so your team knows what this link is").max(120),
  slug: z
    .string()
    .min(2, "Slug is too short")
    .max(40)
    .regex(slugRegex, "Use only letters, numbers, - and _"),
  destinationUrl: z.string().url("Enter a valid URL, e.g. https://tally.so/r/abc"),
  /** One of the tracker's domains (Settings); empty = the main one. */
  shortDomain: z.string().max(253).optional().nullable(),
  campaignId: z.string().optional().nullable(),
  utmSource: z.string().max(80).optional().nullable(),
  utmMedium: z.string().max(80).optional().nullable(),
  utmCampaign: z.string().max(80).optional().nullable(),
  utmContent: z.string().max(120).optional().nullable(),
  utmTerm: z.string().max(120).optional().nullable(),
  customParams: z.record(z.string()).optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;

export const updateLinkSchema = createLinkSchema.partial().extend({
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

/** The label follows the naming rule ("SheCodes F'26", "TopTalents Sprint EwA2oGX F'26"); utm_campaign defaults to it. */
export const createCampaignSchema = z.object({
  name: z.string().trim().max(80).optional().default(""),
  label: projectName,
  description: z.string().max(300).optional().nullable(),
  funnel: z.string().max(80).optional().nullable(),
  season: z.string().max(80).optional().nullable(),
  type: z.string().max(80).optional().nullable(),
  status: z.enum(["active", "paused", "archived"]).default("active"),
});

/**
 * Tilda webhook payload. Tilda posts form fields with arbitrary names,
 * so we accept a loose record and normalise it in the route.
 */
export const tildaWebhookSchema = z
  .object({
    name: z.string().optional(),
    Name: z.string().optional(),
    phone: z.string().optional(),
    Phone: z.string().optional(),
    email: z.string().optional(),
    Email: z.string().optional(),
    formname: z.string().optional(),
    formName: z.string().optional(),
    click_id: z.string().optional(),
    clickId: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_content: z.string().optional(),
    utm_term: z.string().optional(),
    pageUrl: z.string().optional(),
    page_url: z.string().optional(),
    submittedAt: z.string().optional(),
  })
  .passthrough();

export type TildaWebhookInput = z.infer<typeof tildaWebhookSchema>;
