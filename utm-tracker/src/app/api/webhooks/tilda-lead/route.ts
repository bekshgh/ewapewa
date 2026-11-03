import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tildaWebhookSchema } from "@/lib/validation";
import { recordLead } from "@/lib/leads";
import { type NormalisedLead } from "@/lib/attribution";
import { WebhookStatus } from "@prisma/client";
import { safeEqual } from "@/lib/session";
import { campaignForPage, landingLinks } from "@/lib/directLeads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tilda may post JSON or x-www-form-urlencoded / multipart. Parse all. */
async function parseBody(req: NextRequest): Promise<Record<string, any>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as Record<string, any>;
  }
  if (ct.includes("form")) {
    const fd = await req.formData();
    const obj: Record<string, any> = {};
    fd.forEach((v, k) => (obj[k] = typeof v === "string" ? v : v.name));
    return obj;
  }
  // Fallback: try JSON
  return (await req.json().catch(() => ({}))) as Record<string, any>;
}

function checkSecret(req: NextRequest, body: Record<string, any>): boolean {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production"; // not configured → allow only in dev
  const fromHeader = req.headers.get("x-webhook-secret");
  const fromQuery = req.nextUrl.searchParams.get("secret");
  const fromBody = body.secret || body.token;
  return [fromHeader, fromQuery, fromBody].some((v) => typeof v === "string" && safeEqual(v, expected));
}

/** The body as stored in logs and on the lead: never keep the shared secret. */
function withoutSecret(body: Record<string, any>): Record<string, any> {
  const { secret: _secret, token: _token, ...rest } = body;
  return rest;
}

function pick(body: Record<string, any>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    if (body[k] !== undefined && body[k] !== null && String(body[k]).trim() !== "") {
      return String(body[k]);
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  const raw = await parseBody(req);
  const authorised = checkSecret(req, raw);
  const body = withoutSecret(raw);

  // --- auth --- (before anything else, the test ping included, so strangers cannot write to the log)
  if (!authorised) {
    await prisma.webhookLog.create({
      data: { provider: "tilda", payload: body, status: WebhookStatus.unauthorized, message: "Bad or missing secret" },
    });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Tilda sends a test ping like { "test": "test" } when you press "Send test".
  if (body.test !== undefined && Object.keys(body).length <= 2) {
    await prisma.webhookLog.create({
      data: { provider: "tilda", payload: body, status: WebhookStatus.success, message: "Test ping received" },
    });
    return NextResponse.json({ ok: true, message: "Test ping received" });
  }

  const parsed = tildaWebhookSchema.safeParse(body);
  if (!parsed.success) {
    await prisma.webhookLog.create({
      data: { provider: "tilda", payload: body, status: WebhookStatus.failed, message: "Validation failed" },
    });
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 422 });
  }

  // --- normalise ---
  const submittedRaw = pick(body, "submittedAt", "submitted_at");
  const submittedAt = submittedRaw ? new Date(submittedRaw) : new Date();

  const lead: NormalisedLead = {
    name: pick(body, "name", "Name", "Имя"),
    phone: pick(body, "phone", "Phone", "Телефон", "tel"),
    email: pick(body, "email", "Email", "E-mail"),
    formName: pick(body, "formname", "formName", "form"),
    pageUrl: pick(body, "pageUrl", "page_url", "url"),
    clickId: pick(body, "click_id", "clickId", "clickid"),
    utmSource: pick(body, "utm_source"),
    utmMedium: pick(body, "utm_medium"),
    utmCampaign: pick(body, "utm_campaign"),
    utmContent: pick(body, "utm_content"),
    utmTerm: pick(body, "utm_term"),
    submittedAt,
  };

  // Without a click and tags (a visitor who came straight to the form, e.g. Zimran's webhook):
  // a direct registration of the campaign whose links lead to the page, as the page's script does.
  if (!lead.clickId && !lead.utmCampaign && lead.pageUrl) {
    const campaign = campaignForPage(lead.pageUrl, await landingLinks());
    if (campaign) Object.assign(lead, { utmCampaign: campaign, utmSource: lead.utmSource ?? "direct", utmMedium: lead.utmMedium ?? "none" });
  }

  const result = await recordLead(lead, { provider: "tilda", rawPayload: body });

  return NextResponse.json({
    ok: true,
    leadId: result.leadId,
    deduped: result.deduped,
    attribution: result.attribution,
    hasClickId: result.hasClickId,
  });
}

// Allow GET for quick "is it alive" checks from a browser.
export async function GET() {
  return NextResponse.json({ ok: true, message: "Tilda webhook endpoint is live. Use POST." });
}
