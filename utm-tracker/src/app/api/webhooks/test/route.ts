import { guard } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Fires a sample lead at our own /api/webhooks/tilda-lead so users can
 * verify the integration from the Webhook Settings page.
 */
export async function POST(req: NextRequest) {
  const actor = await guard("admin");
  if (actor instanceof NextResponse) return actor;
  const { clickId } = await req.json().catch(() => ({ clickId: undefined }));
  const base = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
  const secret = process.env.WEBHOOK_SECRET || "";

  const payload = {
    name: "Test Lead",
    email: "test.lead@example.com",
    phone: "+7 700 000 0000",
    formname: "Test form",
    click_id: clickId || "",
    utm_source: "instagram",
    utm_medium: "social",
    utm_campaign: "icy_s26",
    utm_content: "test_content",
    pageUrl: "https://your-tilda-page.tilda.ws/",
    submittedAt: new Date().toISOString(),
  };

  const res = await fetch(`${base}/api/webhooks/tilda-lead`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json({ status: res.status, response: json }, { status: 200 });
}
