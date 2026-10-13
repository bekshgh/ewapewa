import { Prisma, AttributionStatus, WebhookStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildDedupeKey } from "@/lib/utils";
import { resolveAttribution, type NormalisedLead } from "@/lib/attribution";

export interface RecordLeadResult {
  leadId: string;
  deduped: boolean;
  attribution: AttributionStatus | null;
  hasClickId: boolean;
}

/**
 * Create a lead from a normalised payload, or return the existing one when a
 * lead with the same dedupe key already exists.
 *
 * Shared by the Tilda webhook (server-side) and the /api/track/conversion
 * endpoint (client-side snippet). Because buildDedupeKey collapses to
 * "ck:<clickId>" whenever a click_id is present, the same submission arriving
 * through both channels is recorded only once. A repeat fills in fields the
 * stored lead is still missing (e.g. contacts typed after the first press of
 * the submit button).
 */
export async function recordLead(
  lead: NormalisedLead,
  opts: { provider: string; rawPayload: Prisma.InputJsonValue; dedupeKey?: string },
): Promise<RecordLeadResult> {
  const dedupeKey = opts.dedupeKey ?? buildDedupeKey({
    clickId: lead.clickId,
    email: lead.email,
    phone: lead.phone,
    formName: lead.formName,
    submittedAt: lead.submittedAt,
  });

  const existing = await findByDedupeKey(dedupeKey);
  if (existing) return logDuplicate(existing, lead, opts);

  const attribution = await resolveAttribution(lead);

  let created;
  try {
    created = await prisma.lead.create({
      data: {
        trackingLinkId: attribution.trackingLinkId,
        clickEventId: attribution.clickEventId,
        clickId: lead.clickId ?? null,
        name: lead.name ?? null,
        phone: lead.phone ?? null,
        email: lead.email ?? null,
        formName: lead.formName ?? null,
        pageUrl: lead.pageUrl ?? null,
        utmSource: lead.utmSource ?? null,
        utmMedium: lead.utmMedium ?? null,
        utmCampaign: lead.utmCampaign ?? null,
        utmContent: lead.utmContent ?? null,
        utmTerm: lead.utmTerm ?? null,
        submittedAt: lead.submittedAt,
        sourcePayload: opts.rawPayload,
        attributionStatus: attribution.status,
        dedupeKey,
      },
    });
  } catch (err) {
    // Two concurrent submissions for the same dedupe key: the loser lands here.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const race = await findByDedupeKey(dedupeKey);
      if (race) return logDuplicate(race, lead, opts);
    }
    throw err;
  }

  const status = lead.clickId ? WebhookStatus.success : WebhookStatus.missing_click_id;
  await prisma.webhookLog.create({
    data: {
      provider: opts.provider,
      payload: opts.rawPayload,
      status,
      message: `Lead created (${attribution.status})`,
      leadId: created.id,
    },
  });

  return {
    leadId: created.id,
    deduped: false,
    attribution: attribution.status,
    hasClickId: Boolean(lead.clickId),
  };
}

const MERGE_FIELDS = [
  "name", "phone", "email", "formName", "pageUrl",
  "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm",
] as const;

function findByDedupeKey(dedupeKey: string) {
  return prisma.lead.findUnique({
    where: { dedupeKey },
    select: {
      id: true, attributionStatus: true, clickId: true,
      ...Object.fromEntries(MERGE_FIELDS.map((f) => [f, true])) as Record<(typeof MERGE_FIELDS)[number], true>,
    },
  });
}

type ExistingLead = NonNullable<Awaited<ReturnType<typeof findByDedupeKey>>>;

async function logDuplicate(
  existing: ExistingLead,
  lead: NormalisedLead,
  opts: { provider: string; rawPayload: Prisma.InputJsonValue },
): Promise<RecordLeadResult> {
  const fill: Prisma.LeadUpdateInput = {};
  for (const f of MERGE_FIELDS) {
    if (!existing[f] && lead[f]) fill[f] = lead[f];
  }
  if (Object.keys(fill).length > 0) {
    await prisma.lead.update({ where: { id: existing.id }, data: fill });
  }

  await prisma.webhookLog.create({
    data: {
      provider: opts.provider,
      payload: opts.rawPayload,
      status: WebhookStatus.duplicated,
      message: "Duplicate lead ignored",
      leadId: existing.id,
    },
  });
  return {
    leadId: existing.id,
    deduped: true,
    attribution: existing.attributionStatus,
    hasClickId: Boolean(existing.clickId),
  };
}
