import { NextRequest, NextResponse } from "next/server";
import { batchSchema, hashIpDaily, ingest, IngestError } from "@/lib/formAnalytics/ingest";
import { isTeamSite } from "@/lib/formAnalytics/project";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Collector for the registration-form analytics on the landings (public).
 * The page sends batches with navigator.sendBeacon / fetch as text/plain,
 * so there is no CORS preflight; OPTIONS is answered anyway.
 *
 * Guards: Origin must be on the allowlist (or a site the team's tracker links
 * lead to — /t.js tracks forms on any such page), body ≤ 64 KB, ≤ 50 events per
 * batch, ≤ 120 batches a minute per IP (per server instance), and the raw IP
 * is never stored — only a hash with a daily salt and the country.
 */

const MAX_BODY = 64 * 1024;
const RATE_PER_MIN = 120;

function allowedOrigins(): Set<string> {
  const list = ["https://aiesecinkz.tilda.ws", "http://aiesecinkz.tilda.ws"];
  if (process.env.NEXT_PUBLIC_BASE_URL) list.push(new URL(process.env.NEXT_PUBLIC_BASE_URL).origin);
  for (const o of (process.env.ANALYTICS_ORIGINS ?? "").split(",")) if (o.trim()) list.push(o.trim().replace(/\/+$/, ""));
  return new Set(list);
}

async function allowed(origin: string | null): Promise<boolean> {
  if (!origin || origin === "null") return false;
  if (allowedOrigins().has(origin)) return true;
  return isTeamSite(origin).catch(() => false);
}

function cors(origin: string | null, ok: boolean): Record<string, string> {
  return origin && ok
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }
    : { Vary: "Origin" };
}

// Best effort on serverless: each instance keeps its own window.
const hits = new Map<string, { n: number; since: number }>();
function limited(key: string, now = Date.now()): boolean {
  const h = hits.get(key);
  if (!h || now - h.since > 60_000) {
    hits.set(key, { n: 1, since: now });
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.since > 60_000) hits.delete(k);
    return false;
  }
  h.n++;
  return h.n > RATE_PER_MIN;
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: cors(origin, await allowed(origin)) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ok = await allowed(origin);
  const headers = cors(origin, ok);
  const reply = (status: number, body?: Record<string, unknown>) =>
    body ? NextResponse.json(body, { status, headers }) : new NextResponse(null, { status, headers });

  if (!ok) return reply(403, { error: "origin not allowed" });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return reply(413, { error: "too large" });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const ipHash = hashIpDaily(ip);
  if (limited(ipHash ?? "unknown")) return reply(429, { error: "slow down" });

  const text = await req.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return reply(text ? 413 : 400, { error: text ? "too large" : "empty" });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return reply(400, { error: "not json" });
  }
  const parsed = batchSchema.safeParse(json);
  if (!parsed.success) return reply(422, { error: parsed.error.issues[0]?.message ?? "invalid batch" });

  try {
    const r = await ingest(parsed.data, { ipHash, country: req.headers.get("x-vercel-ip-country") || null });
    return reply(200, { ok: true, ...r });
  } catch (err) {
    if (err instanceof IngestError) return reply(409, { error: err.message });
    throw err;
  }
}
