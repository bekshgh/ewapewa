import { createSign } from "node:crypto";

/**
 * Read-only Google Sheets access through a service account, with no extra
 * dependencies: a signed JWT is exchanged for an access token, then the Sheets
 * REST API is called. Credentials come from the server environment only:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — the whole key file downloaded from Google Cloud.
 * Nothing about the credentials or the sheet contents is logged.
 */

export class SheetError extends Error {
  constructor(public code: "not_configured" | "bad_link" | "no_access" | "not_found" | "failed", message: string) {
    super(message);
    this.name = "SheetError";
  }
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!sa.client_email || !sa.private_key) return null;
    return { client_email: sa.client_email, private_key: sa.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

/** The address to share sheets with, or null when Google is not set up. */
export function serviceAccountEmail(): string | null {
  return serviceAccount()?.client_email ?? null;
}

/** Accepts a full Google Sheets link or a bare spreadsheet id. */
export function parseSpreadsheetId(input: string): string | null {
  const s = input.trim();
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

let token: { value: string; exp: number } | null = null;

async function accessToken(fetchImpl: typeof fetch): Promise<string> {
  const sa = serviceAccount();
  if (!sa) {
    throw new SheetError("not_configured", "Google ещё не подключён: добавьте GOOGLE_SERVICE_ACCOUNT_JSON в переменные окружения (см. docs/conversions.md). Пока можно загрузить файл таблицы.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (token && token.exp - 60 > now) return token.value;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new SheetError("failed", "Google отклонил ключ сервисного аккаунта. Проверьте GOOGLE_SERVICE_ACCOUNT_JSON.");
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, exp: now + data.expires_in };
  return token.value;
}

async function api<T>(path: string, fetchImpl: typeof fetch): Promise<T> {
  const t = await accessToken(fetchImpl);
  const res = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, { headers: { Authorization: `Bearer ${t}` } });
  if (res.status === 403) {
    throw new SheetError("no_access", `Нет доступа к таблице. Откройте её в Google Sheets → «Настройки доступа» и добавьте ${serviceAccountEmail()} как читателя.`);
  }
  if (res.status === 404) throw new SheetError("not_found", "Таблица не найдена. Проверьте ссылку.");
  if (!res.ok) throw new SheetError("failed", `Google Sheets ответил ошибкой ${res.status}. Попробуйте ещё раз позже.`);
  return (await res.json()) as T;
}

export async function listTabs(spreadsheetId: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const data = await api<{ sheets?: { properties: { title: string } }[] }>(
    `${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
    fetchImpl,
  );
  return (data.sheets ?? []).map((s) => s.properties.title);
}

/** All values of a tab as strings, header row first. */
export async function readTab(spreadsheetId: string, tab: string, fetchImpl: typeof fetch = fetch): Promise<string[][]> {
  const range = `'${tab.replace(/'/g, "''")}'`;
  const data = await api<{ values?: unknown[][] }>(
    `${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    fetchImpl,
  );
  return (data.values ?? []).map((r) => r.map((v) => (v === null || v === undefined ? "" : String(v))));
}
