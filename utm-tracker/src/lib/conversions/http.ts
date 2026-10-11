import { NextResponse } from "next/server";
import { isAdmin, unauthorized } from "@/lib/reports/store";
import { ActionError } from "./actions";

/**
 * Wraps a conversion API handler: admin check on the server first, readable
 * errors, and no request bodies or personal data in the logs.
 */
export async function adminOnly(fn: () => Promise<unknown>): Promise<NextResponse> {
  if (!(await isAdmin())) return unauthorized();
  try {
    const out = await fn();
    return out instanceof NextResponse ? out : NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("conversion_api_failed", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Что-то пошло не так. Попробуйте ещё раз." }, { status: 500 });
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ActionError(400, "Неверный запрос");
  }
}
