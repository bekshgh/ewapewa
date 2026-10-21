import { NextRequest, NextResponse } from "next/server";
import { UAParser } from "ua-parser-js";
import { prisma } from "@/lib/db";
import { generateClickId, hashIp, buildDestinationUrl } from "@/lib/utils";
import { botReason, isOfflineLink, REPEAT_WINDOW_MS } from "@/lib/bots";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /r/{slug}
 * 1. Look up the tracking link.
 * Paused / archived links (or campaigns) still redirect, without counting; an unknown slug gets 404.
 * 2. Record a server-side ClickEvent (so ad blockers / JS-off still count) —
 *    not for link previews / crawlers / prefetches (lib/bots.ts), and only once
 *    for the same device tapping again within seconds.
 * 3. Generate a clickId and forward it + UTM to the destination (Tilda).
 * 4. 302 redirect the visitor instantly.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const slug = params.slug;

  const link = await prisma.trackingLink.findUnique({ where: { slug }, include: { campaign: { select: { status: true } } } });

  // Unknown link: a plain "not found" (it used to bounce visitors to the tracker's sign-in page).
  if (!link) return notFound();

  const utm = {
    utmSource: link.utmSource,
    utmMedium: link.utmMedium,
    utmCampaign: link.utmCampaign,
    utmContent: link.utmContent,
    utmTerm: link.utmTerm,
  };
  const custom = (link.customParams as Record<string, string> | null) ?? null;

  // Paused / archived link, or its campaign paused / archived: printed QR codes and sent posts
  // must keep working, so still open the page — just don't count the click.
  const campaignStatus = link.campaign?.status
    ?? (link.utmCampaign ? (await prisma.campaign.findFirst({ where: { name: link.utmCampaign }, select: { status: true } }))?.status : undefined);
  if (!link.isActive || link.isArchived || (campaignStatus && campaignStatus !== "active")) {
    return NextResponse.redirect(buildDestinationUrl(link.destinationUrl, utm, custom, null), 302);
  }

  // --- gather request metadata ---
  const ua = req.headers.get("user-agent") || "";
  const referrer = req.headers.get("referer") || null;
  const ipRaw =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ipHash = hashIp(ipRaw);
  // Vercel's geo headers (Next 15 dropped req.geo; it read the same headers).
  const country = req.headers.get("x-vercel-ip-country") || null;
  const city = req.headers.get("x-vercel-ip-city") || null;

  const parsed = new UAParser(ua).getResult();
  const device = parsed.device.type || "desktop";
  const browser = parsed.browser.name || null;
  const os = parsed.os.name || null;

  // Capture any extra query params present on the short link itself.
  const rawParams: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (rawParams[k] = v));

  // Link previews, crawlers, scripts, prefetches: redirect, but don't count a click.
  // On printed links (QR codes) only sure bots are skipped: scanner apps look like scripts.
  const bot = botReason({
    method: req.method,
    userAgent: ua,
    acceptLanguage: req.headers.get("accept-language"),
    purpose: req.headers.get("sec-purpose") || req.headers.get("purpose"),
    offline: isOfflineLink(link),
  });
  if (bot) {
    console.info("click_skipped", JSON.stringify({ slug, reason: bot, ua: ua.slice(0, 160) }));
    return NextResponse.redirect(buildDestinationUrl(link.destinationUrl, utm, custom, null), 302);
  }

  // The same device tapping the link again within seconds is still one click: reuse its click_id.
  if (ipHash) {
    const recent = await prisma.clickEvent.findFirst({
      // a scanner app resolving the link, then the browser opening it: one scan
      where: {
        trackingLinkId: link.id, ipHash, timestamp: { gte: new Date(Date.now() - REPEAT_WINDOW_MS) },
        ...(isOfflineLink(link) ? {} : { userAgent: ua || null }),
      },
      orderBy: { timestamp: "desc" },
      select: { clickId: true },
    }).catch(() => null);
    if (recent) return NextResponse.redirect(buildDestinationUrl(link.destinationUrl, utm, custom, recent.clickId), 302);
  }

  const clickId = generateClickId();

  // Unique = first time we see this ipHash for this link (best-effort).
  let isUnique = true;
  if (ipHash) {
    const prior = await prisma.clickEvent.findFirst({
      where: { trackingLinkId: link.id, ipHash },
      select: { id: true },
    });
    isUnique = !prior;
  }

  // Record the click. Never block the redirect on a DB hiccup.
  try {
    await prisma.clickEvent.create({
      data: {
        trackingLinkId: link.id,
        clickId,
        userAgent: ua || null,
        ipHash,
        referrer,
        country,
        city,
        device,
        browser,
        os,
        isUnique,
        rawParams: Object.keys(rawParams).length ? rawParams : undefined,
      },
    });
  } catch (err) {
    console.error("click_record_failed", err);
  }

  return NextResponse.redirect(buildDestinationUrl(link.destinationUrl, utm, custom, clickId), 302);
}

function notFound() {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Link not found</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0e;color:#e4e4e7;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}h1{font-size:22px;margin:0 0 8px}p{color:#a1a1aa;margin:0}</style></head>
<body><div><h1>This link doesn't exist</h1><p>Check the address, or ask whoever shared it for a new one.</p></div></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
