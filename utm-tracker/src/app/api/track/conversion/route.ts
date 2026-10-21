import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordLead } from "@/lib/leads";
import { preferLinkTags, type NormalisedLead } from "@/lib/attribution";
import { CORS, beaconOk, readInput, str } from "@/lib/beacon";
import { hashIp } from "@/lib/utils";
import {
  DIRECT_PER_IP_PER_HOUR, campaignForPage, directDedupeKey, knownHost, landingLinks, recentDirectFrom,
} from "@/lib/directLeads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public conversion endpoint for the on-page snippet.
 *
 * The snippet calls this (via navigator.sendBeacon / fetch / image pixel) when
 * a Tilda form is submitted successfully, so a lead is counted even when no
 * server-side webhook is configured.
 *
 * With a click_id that matches a real recorded click the lead is exact
 * ("ck:<clickId>" dedupe key: at most one lead per click).
 *
 * Without one it is a "direct" registration (see handleDirect): accepted only
 * from pages the team's links point to, with an e-mail or phone, and at most
 * DIRECT_PER_IP_PER_HOUR per visitor IP, since anyone can call this endpoint.
 */

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function handle(req: NextRequest) {
  const body = await readInput(req);
  const ok = (extra?: Record<string, unknown>) => beaconOk(req, extra);

  const clickId = str(body.click_id) || str(body.clickId);
  // Spam guard: the click_id must match a real recorded click.
  const click = clickId
    ? await prisma.clickEvent.findUnique({
        where: { clickId },
        select: {
          id: true,
          trackingLink: { select: { utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true } },
        },
      })
    : null;
  if (!clickId || !click) return handleDirect(req, body);

  const lead: NormalisedLead = {
    name: str(body.name),
    phone: str(body.phone),
    email: str(body.email),
    formName: str(body.formname) || str(body.formName),
    pageUrl: str(body.pageUrl) || str(body.page_url) || str(body.url),
    clickId,
    // The link the visitor came through is the truth; the page's tags only fill gaps
    // (they may be stale, copied along with the address, or mixed from another visit).
    ...preferLinkTags(click.trackingLink, {
      utmSource: str(body.utm_source), utmMedium: str(body.utm_medium), utmCampaign: str(body.utm_campaign),
      utmContent: str(body.utm_content), utmTerm: str(body.utm_term),
    }),
    submittedAt: new Date(),
  };

  const result = await recordLead(lead, {
    provider: "snippet",
    rawPayload: { ...body, _source: "snippet" } as Record<string, string>,
  });

  return ok({ leadId: result.leadId, deduped: result.deduped, attribution: result.attribution });
}

/** A registration from a visitor who did not come through a tracker link. */
async function handleDirect(req: NextRequest, body: Record<string, unknown>) {
  const ok = (extra?: Record<string, unknown>) => beaconOk(req, extra);
  const sid = str(body.sid);
  const pageUrl = str(body.pageUrl) || str(body.page_url) || str(body.url);
  const email = str(body.email);
  const phone = str(body.phone);
  if (!sid || sid.length > 100) return ok({ ignored: "no_click_id" });
  if (!pageUrl || (!email && !phone)) return ok({ ignored: "no_contact" });

  const links = await landingLinks();
  if (!knownHost(pageUrl, links)) return ok({ ignored: "unknown_site" });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const ipHash = hashIp(ip) ?? "unknown";
  if ((await recentDirectFrom(ipHash)) >= DIRECT_PER_IP_PER_HOUR) return ok({ ignored: "rate_limited" });

  const utmCampaign = str(body.utm_campaign);
  const lead: NormalisedLead = {
    name: str(body.name),
    phone,
    email,
    formName: str(body.formname) || str(body.formName),
    pageUrl,
    // UTM in the page URL (a plain UTM link) wins; otherwise the campaign whose links lead to this page.
    utmSource: str(body.utm_source) || "direct",
    utmMedium: str(body.utm_medium) || (utmCampaign ? undefined : "none"),
    utmCampaign: utmCampaign || campaignForPage(pageUrl, links) || undefined,
    utmContent: str(body.utm_content),
    utmTerm: str(body.utm_term),
    submittedAt: new Date(),
  };
  const result = await recordLead(lead, {
    provider: "snippet",
    rawPayload: { ...body, _source: "snippet-direct", _ip: ipHash } as Record<string, string>,
    dedupeKey: directDedupeKey(sid),
  });
  return ok({ leadId: result.leadId, deduped: result.deduped, attribution: result.attribution, direct: true });
}

export const POST = handle;
export const GET = handle;
