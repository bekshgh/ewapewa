import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listTabs, parseSpreadsheetId, readTab, SheetError } from "@/lib/conversions/sheets";
import { guessColumns, parseCsv, parseSheetDate, tableToRows } from "@/lib/conversions/tabular";

describe("tables", () => {
  it("parses CSV with quotes, ; or , and a BOM", () => {
    expect(parseCsv('﻿Email,Name\n"a@b.kz","Doe, John"\n"x@y.kz","say ""hi"""\n')).toEqual([
      ["Email", "Name"],
      ["a@b.kz", "Doe, John"],
      ["x@y.kz", 'say "hi"'],
    ]);
    expect(parseCsv("Почта;Имя\r\na@b.kz;Айнур\r\n")).toEqual([["Почта", "Имя"], ["a@b.kz", "Айнур"]]);
  });

  it("guesses the email column by header, else by content", () => {
    expect(guessColumns([["Отметка времени", "Электронная почта", "Имя", "Номер телефона"], ["", "a@b.kz", "", ""]])).toMatchObject({
      emailCol: "Электронная почта",
      timeCol: "Отметка времени",
      nameCol: "Имя",
      phoneCol: "Номер телефона",
    });
    expect(guessColumns([["Q1", "Q2"], ["yes", "a@b.kz"], ["no", "c@d.kz"]]).emailCol).toBe("Q2");
  });

  it("reads Google Forms timestamps", () => {
    expect(parseSheetDate("11.10.2026 14:03:22")?.toISOString()).toBe("2026-10-11T14:03:22.000Z");
    expect(parseSheetDate("10/11/2026 14:03:22")?.toISOString()).toBe("2026-10-11T14:03:22.000Z");
    expect(parseSheetDate("2026-10-11 14:03")?.getUTCDate()).toBe(11);
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("вчера")).toBeNull();
  });

  it("maps columns to rows with sheet row numbers; a missing email column is explained", () => {
    const t = [["Email", "Когда"], ["a@b.kz", "11.10.2026 10:00:00"], ["", ""], ["c@d.kz", ""]];
    expect(tableToRows(t, { emailCol: "Email", timeCol: "Когда" }).map((r) => r.ref)).toEqual(["row 2", "row 4"]);
    expect(() => tableToRows(t, { emailCol: "Почта" })).toThrow(/Почта/);
  });
});

describe("Google Sheets (service account, mocked HTTP)", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const SA = JSON.stringify({ client_email: "ewa-reader@proj.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  afterEach(() => vi.unstubAllEnvs());

  const fakeFetch = (sheet: (url: string) => Response) =>
    vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "tok", expires_in: 3600 });
      return sheet(u);
    }) as unknown as typeof fetch;

  it("extracts the id from a link", () => {
    expect(parseSpreadsheetId("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0")).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
    expect(parseSpreadsheetId("hello")).toBeNull();
  });

  it("explains a missing setup", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
    await expect(listTabs("x".repeat(30), fakeFetch(() => Response.json({})))).rejects.toMatchObject({ code: "not_configured" });
  });

  it("reads tabs and values, and names the account to share with on 403", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", SA);
    const ok = fakeFetch((u) =>
      u.includes("/values/") ? Response.json({ values: [["Email"], ["a@b.kz"]] }) : Response.json({ sheets: [{ properties: { title: "Ответы" } }] }),
    );
    expect(await listTabs("x".repeat(30), ok)).toEqual(["Ответы"]);
    expect(await readTab("x".repeat(30), "Ответы", ok)).toEqual([["Email"], ["a@b.kz"]]);
    const denied = fakeFetch(() => new Response("", { status: 403 }));
    const err = await readTab("x".repeat(30), "Ответы", denied).catch((e) => e);
    expect(err).toBeInstanceOf(SheetError);
    expect(err.message).toContain("ewa-reader@proj.iam.gserviceaccount.com");
  });
});
